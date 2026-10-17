package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"sync/atomic"
	"testing"
	"time"

	"solarsystem/backend/internal/celestrak"
)

type fakeGroups struct {
	calls atomic.Int64
	fail  atomic.Bool
}

func (f *fakeGroups) FetchGroup(_ context.Context, group string) ([]celestrak.OMM, error) {
	f.calls.Add(1)
	if f.fail.Load() {
		return nil, errors.New("celestrak down")
	}
	var out []celestrak.OMM
	for _, s := range celestrak.Registry {
		if s.Group == group {
			out = append(out, celestrak.OMM{
				ObjectName: "SAT", ObjectID: "2000-001A", Epoch: "2026-10-16T00:00:00.000000",
				MeanMotion: 15, Eccentricity: 0.001, Inclination: 51, RAOfAscNode: 10, ArgOfPericenter: 20, MeanAnomaly: 30,
				ClassificationType: "U", NoradCatID: s.NORAD, ElementSetNo: 999,
			})
		}
	}
	return out, nil
}

func satelliteDeps(t *testing.T) (*Deps, *fakeGroups, *http.ServeMux) {
	t.Helper()
	celestrak.FetchGap = 0
	d := newTestDeps(t, newFakeNasa(t))
	g := &fakeGroups{}
	d.Celestrak = g
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/satellites", d.Satellites)
	return d, g, mux
}

func TestSatellitesServesAndCachesPerSlot(t *testing.T) {
	d, g, mux := satelliteDeps(t)
	rec := get(mux, "/api/satellites")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	var file celestrak.File
	if err := json.Unmarshal(rec.Body.Bytes(), &file); err != nil || len(file.Satellites) != len(celestrak.Registry) {
		t.Fatalf("bad body %v %d", err, len(file.Satellites))
	}
	if got := rec.Header().Get("Cache-Control"); got != "public, max-age=3600" {
		t.Fatalf("cache-control %q", got)
	}
	perBuild := g.calls.Load()
	start := d.Now()
	d.Now = func() time.Time { return start.Add(59 * time.Minute) }
	get(mux, "/api/satellites")
	if g.calls.Load() != perBuild {
		t.Fatalf("same 2-hour slot refetched: %d calls", g.calls.Load())
	}
	d.Now = func() time.Time { return start.Add(2 * time.Hour) }
	get(mux, "/api/satellites")
	if g.calls.Load() != 2*perBuild {
		t.Fatalf("next slot should refetch once: %d calls", g.calls.Load())
	}
}

func TestSatellitesFallsBackToThePreviousSlot(t *testing.T) {
	d, g, mux := satelliteDeps(t)
	start := d.Now()
	if rec := get(mux, "/api/satellites"); rec.Code != http.StatusOK {
		t.Fatalf("seeding failed: %d", rec.Code)
	}
	g.fail.Store(true)
	d.Now = func() time.Time { return start.Add(2 * time.Hour) }
	if rec := get(mux, "/api/satellites"); rec.Code != http.StatusOK {
		t.Fatalf("expected the previous slot, got %d", rec.Code)
	}
}

func TestSatellitesFailureWithNothingCachedIs502AndNotCached(t *testing.T) {
	d, g, mux := satelliteDeps(t)
	g.fail.Store(true)
	if rec := get(mux, "/api/satellites"); rec.Code != http.StatusBadGateway {
		t.Fatalf("expected 502, got %d", rec.Code)
	}
	if _, ok := d.Cache.Get(satellitesKey(d.Now())); ok {
		t.Fatal("a failed build was cached")
	}
}

func TestSatellitesWithoutSourceIs404(t *testing.T) {
	d, _, mux := satelliteDeps(t)
	d.Celestrak = nil
	if rec := get(mux, "/api/satellites"); rec.Code != http.StatusNotFound {
		t.Fatalf("status %d", rec.Code)
	}
}
