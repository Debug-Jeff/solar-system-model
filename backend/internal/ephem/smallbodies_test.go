package ephem

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

type fakeJPL struct {
	neoStatus  int
	neoCalls   atomic.Int32
	failBody   string
	queryRows  int
	neoObjects int
}

func (f *fakeJPL) server(t *testing.T) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		switch r.URL.Path {
		case "/sbdb_query.api":
			rows := [][]any{
				{"2.766", "0.0797", "10.59", "80.25", "73.29", "274.42", "0.2143", "2461200.5"},
				{"2.7", "1.2", "1", "1", "1", "1", "0.2", "2461200.5"},
				{"2.7", "NaN", "1", "1", "1", "1", "0.2", "2461200.5"},
				{nil, "0.1", "1", "1", "1", "1", "0.2", "2461200.5"},
			}
			for i := 0; i < f.queryRows; i++ {
				rows = append(rows, []any{"3.1234567", "0.123456", "12.3456", "45.678", "90.123", "180.456", "0.1912345", "2461200.5"})
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"fields": strings.Split(q.Get("fields"), ","), "data": rows})
		case "/sbdb.api":
			sstr := q.Get("sstr")
			if sstr == f.failBody {
				http.Error(w, "nope", http.StatusInternalServerError)
				return
			}
			_, _ = fmt.Fprintf(w, `{"object":{"fullname":"X %s"},"orbit":{"epoch":"2461200.5","elements":[{"name":"e","value":"0.1"},{"name":"a","value":"2.5"},{"name":"i","value":"5"},{"name":"om","value":"10"},{"name":"w","value":"20"},{"name":"ma","value":"30"},{"name":"n","value":"0.25"}]},"phys_par":[{"name":"diameter","value":"52.4"}]}`, sstr)
		case "/neo/rest/v1/feed":
			f.neoCalls.Add(1)
			if f.neoStatus != 0 {
				w.WriteHeader(f.neoStatus)
				return
			}
			var objects []map[string]any
			for i := 0; i < f.neoObjects; i++ {
				objects = append(objects, map[string]any{
					"neo_reference_id":                  fmt.Sprintf("%d", 3000000+i),
					"name":                              fmt.Sprintf("(2026 N%d)", i),
					"is_potentially_hazardous_asteroid": i == 0,
					"estimated_diameter":                map[string]any{"kilometers": map[string]any{"estimated_diameter_min": 0.01, "estimated_diameter_max": 0.03}},
					"close_approach_data": []any{map[string]any{
						"epoch_date_close_approach": 1792120980000 + int64(i),
						"relative_velocity":         map[string]any{"kilometers_per_second": "5.5"},
						"miss_distance":             map[string]any{"kilometers": fmt.Sprintf("%d", 9_000_000-i*100_000)},
						"orbiting_body":             "Earth",
					}},
				})
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"near_earth_objects": map[string]any{"2026-10-16": objects}})
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(srv.Close)
	return srv
}

func clients(t *testing.T, f *fakeJPL) (*SBDB, *NeoWs) {
	srv := f.server(t)
	s := NewSBDB()
	s.Base = srv.URL
	n := NewNeoWs()
	n.Base = srv.URL
	return s, n
}

var sbNow = time.Date(2026, 10, 16, 3, 0, 0, 0, time.UTC)

func TestQueryDropsInvalidRows(t *testing.T) {
	s, _ := clients(t, &fakeJPL{})
	rows, err := s.Query(context.Background(), "MBA", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0][0] != 2.766 || rows[0][7] != 2461200.5 {
		t.Fatalf("rows = %v", rows)
	}
}

func TestBuildSmallBodies(t *testing.T) {
	f := &fakeJPL{neoObjects: 20}
	s, n := clients(t, f)
	file, err := BuildSmallBodies(context.Background(), s, n, "SECRET_KEY_123", sbNow)
	if err != nil {
		t.Fatal(err)
	}
	if file.Version != 1 || len(file.Named) != len(NamedSmallBodies) {
		t.Fatalf("named %d, want %d", len(file.Named), len(NamedSmallBodies))
	}
	if file.Named[0].RadiusKm != 26.2 {
		t.Errorf("radius from diameter = %v", file.Named[0].RadiusKm)
	}
	if len(file.Neos) != 15 || file.Neos[0].MissKm > file.Neos[1].MissKm || !strings.HasPrefix(file.Neos[0].ID, "neo-") {
		t.Fatalf("neos not sorted/capped: %d %+v", len(file.Neos), file.Neos[:2])
	}
	if file.Belts.Main.Count != 1 || len(file.Belts.Main.Rows) != 8 {
		t.Fatalf("main belt %+v", file.Belts.Main)
	}
	encoded, _ := json.Marshal(file)
	if bytes.Contains(encoded, []byte("SECRET_KEY_123")) {
		t.Fatal("key leaked into output")
	}
}

func TestBuildSmallBodiesWithoutKeyOrNeoWs(t *testing.T) {
	for name, tc := range map[string]struct {
		key    string
		status int
	}{"no key": {"", 0}, "403": {"BAD", http.StatusForbidden}, "503": {"K", http.StatusServiceUnavailable}} {
		t.Run(name, func(t *testing.T) {
			f := &fakeJPL{neoStatus: tc.status, neoObjects: 3}
			s, n := clients(t, f)
			var logs bytes.Buffer
			log.SetOutput(&logs)
			defer log.SetOutput(os.Stderr)
			file, err := BuildSmallBodies(context.Background(), s, n, tc.key, sbNow)
			if err != nil {
				t.Fatal(err)
			}
			if len(file.Neos) != 0 {
				t.Fatalf("expected no neos, got %d", len(file.Neos))
			}
			if tc.key == "" && f.neoCalls.Load() != 0 {
				t.Fatal("called NeoWs without a key")
			}
			if strings.Contains(logs.String(), "api_key") || (tc.key != "" && strings.Contains(logs.String(), tc.key)) {
				t.Fatalf("log leaks key: %s", logs.String())
			}
		})
	}
}

func TestBuildSmallBodiesNamedFailureFails(t *testing.T) {
	s, n := clients(t, &fakeJPL{failBody: NamedSmallBodies[3].Designation})
	if _, err := BuildSmallBodies(context.Background(), s, n, "", sbNow); err == nil {
		t.Fatal("a failing named body must fail the build")
	}
}

func TestSmallBodiesFitBudget(t *testing.T) {
	s, n := clients(t, &fakeJPL{queryRows: 3000, neoObjects: 50})
	file, err := BuildSmallBodies(context.Background(), s, n, "K", sbNow)
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(file)
	if len(encoded) > 600_000 {
		t.Fatalf("smallbodies.json would be %d bytes", len(encoded))
	}
}
