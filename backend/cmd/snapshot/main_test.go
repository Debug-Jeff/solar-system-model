package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"solarsystem/backend/internal/celestrak"
	"solarsystem/backend/internal/ephem"
)

type fakeVectors struct{ fail bool }

func (f fakeVectors) Vectors(_ context.Context, _, _ string, start, stop time.Time, step time.Duration) ([]ephem.State, error) {
	if f.fail {
		return nil, errors.New("down")
	}
	startJD := float64(start.Unix())/86400 + 2440587.5
	n := int(stop.Sub(start)/step) + 1
	out := make([]ephem.State, n)
	for i := range out {
		out[i] = ephem.State{JD: startJD + float64(i)*step.Hours()/24, X: 1}
	}
	return out, nil
}

func fakeSBDB(t *testing.T, e string) *ephem.SBDB {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("full-prec") != "1" {
			http.Error(w, "need full precision", http.StatusBadRequest)
			return
		}
		_, _ = w.Write([]byte(`{"orbit":{"epoch":"2461200.5","elements":[{"name":"e","value":"` + e + `"},{"name":"a","value":"2.7"},{"name":"i","value":"10"},{"name":"om","value":"80"},{"name":"w","value":"73"},{"name":"ma","value":"274"},{"name":"n","value":"0.21"}]}}`))
	}))
	t.Cleanup(srv.Close)
	s := ephem.NewSBDB()
	s.Base = srv.URL
	return s
}

func options(t *testing.T, vectors ephem.VectorSource, sbdb *ephem.SBDB) Options {
	dir := t.TempDir()
	return Options{
		OutDir:       filepath.Join(dir, "ephem"),
		ElementsPath: filepath.Join(dir, "smallBodyElements.json"),
		Vectors:      vectors,
		SBDB:         sbdb,
		Now:          time.Date(2026, 10, 16, 3, 0, 0, 0, time.UTC),
	}
}

func TestRunWritesEverything(t *testing.T) {
	opts := options(t, fakeVectors{}, fakeSBDB(t, "0.0797"))
	if err := Run(context.Background(), opts); err != nil {
		t.Fatal(err)
	}
	entries, _ := os.ReadDir(opts.OutDir)
	if len(entries) != len(ephem.Sets) {
		t.Fatalf("wrote %d set files, want %d", len(entries), len(ephem.Sets))
	}
	raw, err := os.ReadFile(opts.ElementsPath)
	if err != nil {
		t.Fatal(err)
	}
	var elements map[string]ephem.Elements
	if err := json.Unmarshal(raw, &elements); err != nil || len(elements) != 3 || elements["ceres"].E != 0.0797 {
		t.Fatalf("bad elements file %v %s", err, raw)
	}
}

func TestRunLeavesFilesAloneOnFailure(t *testing.T) {
	opts := options(t, fakeVectors{}, fakeSBDB(t, "0.0797"))
	if err := Run(context.Background(), opts); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(opts.ElementsPath)
	beforeSet, _ := os.ReadFile(filepath.Join(opts.OutDir, "moons-earth.json"))

	opts.Vectors = fakeVectors{fail: true}
	opts.Now = opts.Now.AddDate(0, 0, 1)
	if err := Run(context.Background(), opts); err == nil {
		t.Fatal("expected failure")
	}
	after, _ := os.ReadFile(opts.ElementsPath)
	afterSet, _ := os.ReadFile(filepath.Join(opts.OutDir, "moons-earth.json"))
	if string(before) != string(after) || string(beforeSet) != string(afterSet) {
		t.Fatal("files changed after a failed run")
	}
}

func TestRunRejectsHyperbolicElements(t *testing.T) {
	opts := options(t, fakeVectors{}, fakeSBDB(t, "1.2"))
	if err := Run(context.Background(), opts); err == nil {
		t.Fatal("expected rejection of e >= 1")
	}
	if _, err := os.Stat(opts.ElementsPath); !os.IsNotExist(err) {
		t.Fatal("elements file should not exist after rejection")
	}
}

type fakeGroups struct{ fail bool }

func (f fakeGroups) FetchGroup(_ context.Context, group string) ([]celestrak.OMM, error) {
	if f.fail {
		return nil, errors.New("celestrak down")
	}
	var out []celestrak.OMM
	for _, s := range celestrak.Registry {
		if s.Group == group {
			out = append(out, celestrak.OMM{
				ObjectName: "SAT", ObjectID: "2000-001A", Epoch: "2026-10-15T00:00:00.000000",
				MeanMotion: 15, Eccentricity: 0.001, Inclination: 51, RAOfAscNode: 10, ArgOfPericenter: 20, MeanAnomaly: 30,
				ClassificationType: "U", NoradCatID: s.NORAD, ElementSetNo: 999,
			})
		}
	}
	return out, nil
}

func TestRunWritesSatellites(t *testing.T) {
	celestrak.FetchGap = 0
	opts := options(t, fakeVectors{}, fakeSBDB(t, "0.0797"))
	opts.SatellitesPath = filepath.Join(t.TempDir(), "satellites.json")
	opts.Satellites = fakeGroups{}
	if err := Run(context.Background(), opts); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(opts.SatellitesPath)
	if err != nil {
		t.Fatal(err)
	}
	var file celestrak.File
	if err := json.Unmarshal(raw, &file); err != nil || len(file.Satellites) != len(celestrak.Registry) {
		t.Fatalf("bad satellites file %v", err)
	}
}

func TestSatelliteFailureKeepsTheOldFileAndTheRestOfTheSnapshot(t *testing.T) {
	celestrak.FetchGap = 0
	opts := options(t, fakeVectors{}, fakeSBDB(t, "0.0797"))
	opts.SatellitesPath = filepath.Join(t.TempDir(), "satellites.json")
	opts.Satellites = fakeGroups{}
	if err := Run(context.Background(), opts); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(opts.SatellitesPath)
	opts.Satellites = fakeGroups{fail: true}
	opts.Now = opts.Now.Add(24 * time.Hour)
	if err := Run(context.Background(), opts); err != nil {
		t.Fatalf("a CelesTrak outage must not fail the snapshot: %v", err)
	}
	after, _ := os.ReadFile(opts.SatellitesPath)
	if string(before) != string(after) {
		t.Fatal("satellites file changed after a failed build")
	}
	set, _ := os.ReadFile(filepath.Join(opts.OutDir, "moons-earth.json"))
	if !strings.Contains(string(set), "2026-10-17") {
		t.Fatal("the rest of the snapshot should still refresh")
	}
}
