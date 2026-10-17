package ephem

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"golang.org/x/time/rate"
)

const sampleResult = `header
$$SOE
2461299.500000000, A.D. 2026-Sep-16 00:00:00.0000, 1.0E+05, -2.0E+05, 3.5E+02, 1.0E+01, -2.0E+00, 3.0E-01,
2461299.720833333, A.D. 2026-Sep-16 05:18:00.0000, 1.1E+05, -2.1E+05, 3.6E+02, 1.1E+01, -2.1E+00, 3.1E-01,
2461299.941666667, A.D. 2026-Sep-16 10:36:00.0000, 1.2E+05, -2.2E+05, 3.7E+02, 1.2E+01, -2.2E+00, 3.2E-01,
$$EOE
footer`

func fakeHorizons(t *testing.T, handler http.HandlerFunc) *Horizons {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	h := NewHorizons()
	h.Base = srv.URL
	h.minGap = 0
	return h
}

func jsonResult(result string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"result": result})
	}
}

var start = time.Date(2026, 9, 16, 0, 0, 0, 0, time.UTC)

func TestVectorsParsesRows(t *testing.T) {
	h := fakeHorizons(t, jsonResult(sampleResult))
	states, err := h.Vectors(context.Background(), "501", "500@599", start, start.Add(24*time.Hour), 318*time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if len(states) != 3 {
		t.Fatalf("got %d states", len(states))
	}
	s := states[1]
	if s.JD != 2461299.720833333 || s.X != 1.1e5 || s.Y != -2.1e5 || s.Z != 360 || s.VX != 11 || s.VY != -2.1 || s.VZ != 0.31 {
		t.Fatalf("bad state %+v", s)
	}
}

func TestVectorsQuery(t *testing.T) {
	var query string
	h := fakeHorizons(t, func(w http.ResponseWriter, r *http.Request) {
		query = r.URL.RawQuery
		jsonResult(sampleResult)(w, r)
	})
	if _, err := h.Vectors(context.Background(), "501", "500@599", start, start.Add(time.Hour), 318*time.Minute); err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"COMMAND=%27501%27", "CENTER=%27500%40599%27", "STEP_SIZE=%27318m%27", "OUT_UNITS=KM-S", "VEC_TABLE=2", "REF_PLANE=ECLIPTIC", "CSV_FORMAT=YES"} {
		if !strings.Contains(query, want) {
			t.Errorf("query %q missing %q", query, want)
		}
	}
}

func TestVectorsErrors(t *testing.T) {
	cases := map[string]http.HandlerFunc{
		"error field": func(w http.ResponseWriter, r *http.Request) {
			_ = json.NewEncoder(w).Encode(map[string]any{"error": "no such object", "result": ""})
		},
		"no SOE":     jsonResult("nothing here"),
		"not json":   func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("<html>maintenance</html>")) },
		"503":        func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusServiceUnavailable) },
		"bad number": jsonResult("$$SOE\n2461299.5, x, NaNx, 1, 1, 1, 1, 1,\n$$EOE"),
	}
	for name, handler := range cases {
		t.Run(name, func(t *testing.T) {
			h := fakeHorizons(t, handler)
			_, err := h.Vectors(context.Background(), "501", "500@599", start, start.Add(time.Hour), time.Hour)
			if err == nil {
				t.Fatal("expected error")
			}
			if strings.Contains(err.Error(), "?") {
				t.Fatalf("error leaks query string: %v", err)
			}
		})
	}
}

func TestVectorsSpacesRequests(t *testing.T) {
	var calls atomic.Int32
	var first, second time.Time
	h := fakeHorizons(t, func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			first = time.Now()
		} else {
			second = time.Now()
		}
		jsonResult(sampleResult)(w, r)
	})
	h.minGap = 50 * time.Millisecond
	for i := 0; i < 2; i++ {
		if _, err := h.Vectors(context.Background(), "501", "500@599", start, start.Add(time.Hour), time.Hour); err != nil {
			t.Fatal(err)
		}
	}
	if gap := second.Sub(first); gap < 45*time.Millisecond {
		t.Fatalf("requests only %v apart", gap)
	}
}

func TestVectorsBudgetFailsFast(t *testing.T) {
	var calls atomic.Int32
	h := fakeHorizons(t, func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		jsonResult(sampleResult)(w, r)
	})
	h.SetBudget(rate.Every(time.Hour), 1)
	if _, err := h.Vectors(context.Background(), "501", "500@599", start, start.Add(time.Hour), time.Hour); err != nil {
		t.Fatal(err)
	}
	_, err := h.Vectors(context.Background(), "501", "500@599", start, start.Add(time.Hour), time.Hour)
	if !errors.Is(err, ErrBudgetExhausted) {
		t.Fatalf("expected ErrBudgetExhausted, got %v", err)
	}
	if calls.Load() != 1 {
		t.Fatalf("budget exhaustion still called upstream (%d calls)", calls.Load())
	}
}

func TestVectorsQueueRespectsContext(t *testing.T) {
	block := make(chan struct{})
	var calls atomic.Int32
	h := fakeHorizons(t, func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			<-block
		}
		jsonResult(sampleResult)(w, r)
	})
	go func() {
		_, _ = h.Vectors(context.Background(), "501", "500@599", start, start.Add(time.Hour), time.Hour)
	}()
	time.Sleep(20 * time.Millisecond)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	began := time.Now()
	_, err := h.Vectors(ctx, "502", "500@599", start, start.Add(time.Hour), time.Hour)
	close(block)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected deadline while queued, got %v", err)
	}
	if time.Since(began) > 500*time.Millisecond {
		t.Fatalf("queued call ignored its context for %v", time.Since(began))
	}
}

func TestCoverageErrorParsing(t *testing.T) {
	cases := map[string]struct {
		text          string
		after, before string
	}{
		"after":    {`No ephemeris for target "Mars Reconnaissance Orbiter (spacecraft)" after A.D. 2026-OCT-27 00:01:09.1826 TDB`, "2026-10-27T00:01:09Z", ""},
		"prior to": {`No ephemeris for target "Hera (spacecraft)" prior to A.D. 2024-OCT-07 15:00:00.0000 TDB`, "", "2024-10-07T15:00:00Z"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			h := fakeHorizons(t, func(w http.ResponseWriter, r *http.Request) {
				_ = json.NewEncoder(w).Encode(map[string]any{"error": c.text, "result": ""})
			})
			_, err := h.Vectors(context.Background(), "-74", "500@499", start, start.Add(time.Hour), time.Hour)
			var cov *CoverageError
			if !errors.As(err, &cov) {
				t.Fatalf("expected CoverageError, got %v", err)
			}
			if c.after != "" && cov.After.UTC().Format(time.RFC3339) != c.after {
				t.Errorf("after = %v", cov.After)
			}
			if c.before != "" && cov.Before.UTC().Format(time.RFC3339) != c.before {
				t.Errorf("before = %v", cov.Before)
			}
		})
	}
}
