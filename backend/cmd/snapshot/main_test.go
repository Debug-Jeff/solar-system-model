package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

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
