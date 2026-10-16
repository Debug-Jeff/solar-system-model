package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"solarsystem/backend/internal/ephem"
)

type fakeVectors struct {
	calls atomic.Int64
	fail  atomic.Bool
	delay time.Duration
}

func (f *fakeVectors) Vectors(_ context.Context, _, _ string, start, stop time.Time, step time.Duration) ([]ephem.State, error) {
	f.calls.Add(1)
	if f.delay > 0 {
		time.Sleep(f.delay)
	}
	if f.fail.Load() {
		return nil, errors.New("horizons down")
	}
	startJD := float64(start.Unix())/86400 + 2440587.5
	n := int(stop.Sub(start)/step) + 1
	out := make([]ephem.State, n)
	for i := range out {
		out[i] = ephem.State{JD: startJD + float64(i)*step.Hours()/24, X: 1, Y: 2, Z: 3}
	}
	return out, nil
}

func ephemMux(d *Deps) *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/ephem/{set}", d.Ephem)
	return mux
}

func get(h http.Handler, target string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, target, nil))
	return rec
}

func TestEphemRejectsUnknownSets(t *testing.T) {
	d := newTestDeps(t, newFakeNasa(t))
	v := &fakeVectors{}
	d.Horizons = v
	mux := ephemMux(d)
	for _, target := range []string{"/api/ephem/moons-pluto", "/api/ephem/..%2F..%2Fetc", "/api/ephem/moons-jupiter%00", "/api/ephem/"} {
		if rec := get(mux, target); rec.Code != http.StatusNotFound && rec.Code != http.StatusBadRequest {
			t.Errorf("%s: status %d", target, rec.Code)
		}
	}
	if v.calls.Load() != 0 {
		t.Fatalf("unknown sets triggered %d upstream calls", v.calls.Load())
	}
}

func TestEphemServesAndCaches(t *testing.T) {
	d := newTestDeps(t, newFakeNasa(t))
	v := &fakeVectors{}
	d.Horizons = v
	mux := ephemMux(d)
	rec := get(mux, "/api/ephem/moons-mars")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	var file ephem.SetFile
	if err := json.Unmarshal(rec.Body.Bytes(), &file); err != nil || file.Set != "moons-mars" || len(file.Bodies) != 2 {
		t.Fatalf("bad body %v %+v", err, file)
	}
	if got := rec.Header().Get("Cache-Control"); got != "public, max-age=21600" {
		t.Errorf("Cache-Control = %q", got)
	}
	get(mux, "/api/ephem/moons-mars")
	if v.calls.Load() != 2 {
		t.Fatalf("expected one build (2 bodies), got %d calls", v.calls.Load())
	}
}

func TestEphemSingleflight(t *testing.T) {
	d := newTestDeps(t, newFakeNasa(t))
	v := &fakeVectors{delay: 30 * time.Millisecond}
	d.Horizons = v
	mux := ephemMux(d)
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if rec := get(mux, "/api/ephem/moons-earth"); rec.Code != http.StatusOK {
				t.Errorf("status %d", rec.Code)
			}
		}()
	}
	wg.Wait()
	if v.calls.Load() != 1 {
		t.Fatalf("expected exactly 1 build, got %d", v.calls.Load())
	}
}

func TestEphemFallsBackToYesterday(t *testing.T) {
	d := newTestDeps(t, newFakeNasa(t))
	v := &fakeVectors{}
	d.Horizons = v
	mux := ephemMux(d)
	today := d.Now()
	d.Now = func() time.Time { return today.AddDate(0, 0, -1) }
	if rec := get(mux, "/api/ephem/moons-earth"); rec.Code != http.StatusOK {
		t.Fatalf("seeding yesterday failed: %d", rec.Code)
	}
	d.Now = func() time.Time { return today }
	v.fail.Store(true)
	if rec := get(mux, "/api/ephem/moons-earth"); rec.Code != http.StatusOK {
		t.Fatalf("expected yesterday's file, got %d", rec.Code)
	}
	if rec := get(mux, "/api/ephem/moons-mars"); rec.Code != http.StatusBadGateway {
		t.Fatalf("expected 502 with nothing cached, got %d", rec.Code)
	}
}

type budgetVectors struct{ calls atomic.Int64 }

func (b *budgetVectors) Vectors(context.Context, string, string, time.Time, time.Time, time.Duration) ([]ephem.State, error) {
	b.calls.Add(1)
	return nil, ephem.ErrBudgetExhausted
}

func TestEphemBudgetIsA503AndNotFailureCached(t *testing.T) {
	d := newTestDeps(t, newFakeNasa(t))
	b := &budgetVectors{}
	d.Horizons = b
	mux := ephemMux(d)
	rec := get(mux, "/api/ephem/moons-earth")
	if rec.Code != http.StatusServiceUnavailable || rec.Header().Get("Retry-After") == "" {
		t.Fatalf("expected 503 with Retry-After, got %d %q", rec.Code, rec.Header().Get("Retry-After"))
	}
	get(mux, "/api/ephem/moons-earth")
	if b.calls.Load() != 2 {
		t.Fatalf("budget errors must not be failure-cached (calls %d)", b.calls.Load())
	}
}
