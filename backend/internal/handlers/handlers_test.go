package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"golang.org/x/time/rate"

	"solarsystem/backend/internal/diskcache"
	"solarsystem/backend/internal/nasa"
)

var jpeg = []byte{0xFF, 0xD8, 0xFF, 0xE0, 'j', 'p', 'g'}

type fakeNasa struct {
	server *httptest.Server
	hits   atomic.Int64
	paths  sync.Map
	apod   string
	gibsOK map[string]bool
	delay  time.Duration
}

func newFakeNasa(t *testing.T) *fakeNasa {
	f := &fakeNasa{gibsOK: map[string]bool{}}
	f.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.hits.Add(1)
		f.paths.Store(r.URL.String(), true)
		if f.delay > 0 {
			time.Sleep(f.delay)
		}
		switch {
		case r.URL.Path == "/planetary/apod":
			w.Write([]byte(f.apod))
		case r.URL.Path == "/api/natural":
			w.Write([]byte(`[{"date":"2026-10-15 00:31:45","image":"epic_1b_20261015003633","caption":"c"},{"date":"bad","image":"../x"}]`))
		case strings.HasPrefix(r.URL.Path, "/archive/natural/"):
			w.Write(jpeg)
		case r.URL.Path == "/api/v1/snapshot":
			if f.gibsOK[r.URL.Query().Get("TIME")] {
				w.Write(jpeg)
				return
			}
			w.Write([]byte("<xml>no data</xml>"))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(f.server.Close)
	return f
}

func newTestDeps(t *testing.T, f *fakeNasa) *Deps {
	client := nasa.NewClient("SECRET_KEY")
	client.APODBase = f.server.URL
	client.EPICBase = f.server.URL
	client.GIBSBase = f.server.URL
	client.SetRateLimit(rate.Inf, 0)
	d := New(client, diskcache.New(t.TempDir()), []byte(`{"bodies":[]}`))
	d.Now = func() time.Time { return time.Date(2026, 10, 16, 3, 0, 0, 0, time.UTC) }
	return d
}

func serve(h http.HandlerFunc, target string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h(rec, httptest.NewRequest(http.MethodGet, target, nil))
	return rec
}

func TestEpicImageRejectsBadParams(t *testing.T) {
	f := newFakeNasa(t)
	d := newTestDeps(t, f)
	cases := []string{
		"/api/epic/image?year=2026&month=10&day=15&name=../../../../etc/passwd",
		"/api/epic/image?year=2026&month=10&day=15&name=epic_1b_20261014003633",
		"/api/epic/image?year=2026&month=10&day=1&name=epic_1b_20261001003633",
		"/api/epic/image?year=26&month=10&day=15&name=epic_1b_20261015003633",
		"/api/epic/image?year=2026&month=13&day=15&name=epic_1b_20261315003633",
		"/api/epic/image?year=2027&month=01&day=01&name=epic_1b_20270101003633",
		"/api/epic/image?year=2026&month=10&day=15",
	}
	for _, target := range cases {
		if rec := serve(d.EpicImage, target); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: got %d, want 400", target, rec.Code)
		}
	}
	if n := f.hits.Load(); n != 0 {
		t.Fatalf("invalid requests reached upstream %d times", n)
	}
}

func TestEpicImageServesAndCaches(t *testing.T) {
	f := newFakeNasa(t)
	d := newTestDeps(t, f)
	target := "/api/epic/image?year=2026&month=10&day=15&name=epic_1b_20261015003633"
	for i := 0; i < 3; i++ {
		rec := serve(d.EpicImage, target)
		if rec.Code != http.StatusOK || rec.Header().Get("Content-Type") != "image/jpeg" {
			t.Fatalf("got %d %q", rec.Code, rec.Header().Get("Content-Type"))
		}
		if rec.Header().Get("Cache-Control") != cacheImmutable {
			t.Fatalf("Cache-Control = %q", rec.Header().Get("Cache-Control"))
		}
	}
	if n := f.hits.Load(); n != 1 {
		t.Fatalf("upstream hit %d times, want 1", n)
	}
}

func TestApodRejectsInjectionAndOutOfRange(t *testing.T) {
	f := newFakeNasa(t)
	d := newTestDeps(t, f)
	cases := []string{
		"/api/apod?date=2024-01-01%26hd%3Dtrue",
		"/api/apod?date=../../x",
		"/api/apod?date=1990-01-01",
		"/api/apod?date=2026-10-17",
		"/api/apod?date=2024-1-01",
	}
	for _, target := range cases {
		if rec := serve(d.Apod, target); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: got %d, want 400", target, rec.Code)
		}
	}
	if n := f.hits.Load(); n != 0 {
		t.Fatalf("invalid requests reached upstream %d times", n)
	}
}

func TestApodTodayUsesEasternDate(t *testing.T) {
	f := newFakeNasa(t)
	d := newTestDeps(t, f)
	f.apod = `{"date":"2026-10-15","title":"t"}`
	serve(d.Apod, "/api/apod")
	serve(d.Apod, "/api/apod")
	if n := f.hits.Load(); n != 1 {
		t.Fatalf("upstream hit %d times, want 1 (today in ET is 2026-10-15)", n)
	}
	if _, ok := d.Cache.Get("apod/today-2026-10-15.json"); !ok {
		t.Fatal("expected APOD cached under the Eastern-time date")
	}
}

func TestApodTodaySkipsCachingStaleDay(t *testing.T) {
	f := newFakeNasa(t)
	d := newTestDeps(t, f)
	f.apod = `{"date":"2026-10-14","title":"t"}`
	if rec := serve(d.Apod, "/api/apod"); rec.Code != http.StatusOK {
		t.Fatalf("got %d", rec.Code)
	}
	if _, ok := d.Cache.Get("apod/today-2026-10-15.json"); ok {
		t.Fatal("stale APOD must not be cached under today's key")
	}
}

func TestUpstreamErrorsDoNotLeakAPIKey(t *testing.T) {
	f := newFakeNasa(t)
	d := newTestDeps(t, f)
	d.Nasa.APODBase = f.server.URL + "/missing"
	var logged strings.Builder
	captureLog(t, &logged)
	rec := serve(d.Apod, "/api/apod?date=2024-01-01")
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("got %d, want 502", rec.Code)
	}
	if strings.Contains(logged.String(), "SECRET_KEY") || strings.Contains(rec.Body.String(), "SECRET_KEY") {
		t.Fatalf("API key leaked: log=%q body=%q", logged.String(), rec.Body.String())
	}
}

func TestFailuresAreCachedBriefly(t *testing.T) {
	f := newFakeNasa(t)
	d := newTestDeps(t, f)
	d.Nasa.APODBase = f.server.URL + "/missing"
	for i := 0; i < 5; i++ {
		serve(d.Apod, "/api/apod?date=2024-01-01")
	}
	if n := f.hits.Load(); n != 1 {
		t.Fatalf("upstream hit %d times, want 1", n)
	}
}

func TestGibsValidatesAndBoundsLookback(t *testing.T) {
	f := newFakeNasa(t)
	d := newTestDeps(t, f)
	for _, target := range []string{
		"/api/gibs/earth-texture?date=1900-01-01",
		"/api/gibs/earth-texture?date=2026-12-01",
		"/api/gibs/earth-texture?date=garbage",
	} {
		if rec := serve(d.Gibs, target); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: got %d, want 400", target, rec.Code)
		}
	}
	if n := f.hits.Load(); n != 0 {
		t.Fatalf("invalid requests reached upstream %d times", n)
	}

	serve(d.Gibs, "/api/gibs/earth-texture")
	serve(d.Gibs, "/api/gibs/earth-texture")
	if n := f.hits.Load(); n != gibsLookbackDay {
		t.Fatalf("upstream hit %d times, want %d (second sweep served from failure cache)", n, gibsLookbackDay)
	}
}

func TestGibsWalksBackToAvailableDay(t *testing.T) {
	f := newFakeNasa(t)
	d := newTestDeps(t, f)
	f.gibsOK["2026-10-14"] = true
	rec := serve(d.Gibs, "/api/gibs/earth-texture")
	if rec.Code != http.StatusOK || rec.Header().Get("X-Image-Date") != "2026-10-14" {
		t.Fatalf("got %d date=%q", rec.Code, rec.Header().Get("X-Image-Date"))
	}
	if rec.Header().Get("Cache-Control") != cacheDaily {
		t.Fatalf("Cache-Control = %q", rec.Header().Get("Cache-Control"))
	}
}

func TestConcurrentRequestsShareOneUpstreamFetch(t *testing.T) {
	f := newFakeNasa(t)
	f.delay = 100 * time.Millisecond
	f.gibsOK["2026-10-16"] = true
	d := newTestDeps(t, f)
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			serve(d.Gibs, "/api/gibs/earth-texture")
		}()
	}
	wg.Wait()
	if n := f.hits.Load(); n != 1 {
		t.Fatalf("upstream hit %d times, want 1", n)
	}
}

func TestUpstreamBudgetReturns503(t *testing.T) {
	f := newFakeNasa(t)
	d := newTestDeps(t, f)
	d.Nasa.SetRateLimit(rate.Every(time.Hour), 1)
	f.apod = `{"date":"2024-01-01"}`
	serve(d.Apod, "/api/apod?date=2024-01-01")
	rec := serve(d.Apod, "/api/apod?date=2024-01-02")
	if rec.Code != http.StatusServiceUnavailable || rec.Header().Get("Retry-After") == "" {
		t.Fatalf("got %d Retry-After=%q", rec.Code, rec.Header().Get("Retry-After"))
	}
}

func TestEpicListRewritesOnlyValidEntries(t *testing.T) {
	f := newFakeNasa(t)
	d := newTestDeps(t, f)
	rec := serve(d.Epic, "/api/epic")
	var items []map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &items); err != nil || len(items) != 2 {
		t.Fatalf("decode: %v %s", err, rec.Body.String())
	}
	want := "/api/epic/image?year=2026&month=10&day=15&name=epic_1b_20261015003633"
	if items[0]["imageUrl"] != want {
		t.Fatalf("imageUrl = %v, want %s", items[0]["imageUrl"], want)
	}
	if _, ok := items[1]["imageUrl"]; ok {
		t.Fatalf("invalid entry got an imageUrl: %v", items[1])
	}
}

func TestLoggingRecordsStatus(t *testing.T) {
	var logged strings.Builder
	captureLog(t, &logged)
	h := Logging(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTeapot)
	}))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/x", nil))
	if !strings.Contains(logged.String(), "GET /x 418") {
		t.Fatalf("log = %q", logged.String())
	}
}
