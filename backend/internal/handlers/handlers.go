package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
	_ "time/tzdata"

	"golang.org/x/sync/singleflight"

	"solarsystem/backend/internal/diskcache"
	"solarsystem/backend/internal/ephem"
	"solarsystem/backend/internal/nasa"
)

const (
	dateLayout      = "2006-01-02"
	failureTTL      = 10 * time.Minute
	maxFailureKeys  = 10_000
	gibsWidth       = 4096
	gibsHeight      = 2048
	gibsLookbackDay = 5
)

const (
	cacheImmutable = "public, max-age=31536000, immutable"
	cacheDaily     = "public, max-age=86400"
	cacheShort     = "public, max-age=1800"
	cacheNone      = "no-store"
)

var (
	easternTime = mustLoadLocation("America/New_York")
	apodFirst   = time.Date(1995, 6, 16, 0, 0, 0, 0, time.UTC)
	epicFirst   = time.Date(2015, 6, 13, 0, 0, 0, 0, time.UTC)
	gibsFirst   = time.Date(2000, 2, 24, 0, 0, 0, 0, time.UTC)
	yearRe      = regexp.MustCompile(`^\d{4}$`)
	twoDigitRe  = regexp.MustCompile(`^\d{2}$`)
	epicNameRe  = regexp.MustCompile(`^epic_1b_(\d{8})\d{6}$`)

	errRecentFailure = errors.New("upstream recently failed for this resource")
)

func mustLoadLocation(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		panic(err)
	}
	return loc
}

type Deps struct {
	Nasa        *nasa.Client
	Cache       *diskcache.Cache
	PlanetsJSON []byte
	Horizons    ephem.VectorSource
	Now         func() time.Time

	group    singleflight.Group
	failures failureCache
}

func New(client *nasa.Client, cache *diskcache.Cache, planetsJSON []byte) *Deps {
	return &Deps{Nasa: client, Cache: cache, PlanetsJSON: planetsJSON, Now: time.Now}
}

type failureCache struct {
	mu    sync.Mutex
	until map[string]time.Time
}

func (f *failureCache) recent(key string, now time.Time) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	t, ok := f.until[key]
	if !ok {
		return false
	}
	if now.After(t) {
		delete(f.until, key)
		return false
	}
	return true
}

func (f *failureCache) record(key string, now time.Time) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.until == nil {
		f.until = make(map[string]time.Time)
	}
	if len(f.until) >= maxFailureKeys {
		for k, t := range f.until {
			if now.After(t) {
				delete(f.until, k)
			}
		}
		if len(f.until) >= maxFailureKeys {
			return
		}
	}
	f.until[key] = now.Add(failureTTL)
}

type fetchFunc func(ctx context.Context) (body []byte, cacheable bool, err error)

func (d *Deps) fetchCached(ctx context.Context, key string, fetch fetchFunc) ([]byte, error) {
	if cached, ok := d.Cache.Get(key); ok {
		return cached, nil
	}
	if d.failures.recent(key, d.Now()) {
		return nil, errRecentFailure
	}
	v, err, _ := d.group.Do(key, func() (any, error) {
		if cached, ok := d.Cache.Get(key); ok {
			return cached, nil
		}
		body, cacheable, err := fetch(context.WithoutCancel(ctx))
		if err != nil {
			if !errors.Is(err, nasa.ErrRateLimited) {
				d.failures.record(key, d.Now())
			}
			return nil, err
		}
		if cacheable {
			if err := d.Cache.Put(key, body); err != nil {
				log.Printf("cache put %s: %v", key, err)
			}
		}
		return body, nil
	})
	if err != nil {
		return nil, err
	}
	return v.([]byte), nil
}

func writeBody(w http.ResponseWriter, status int, contentType, cacheControl string, body []byte) {
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", cacheControl)
	w.WriteHeader(status)
	w.Write(body)
}

func writeJSON(w http.ResponseWriter, cacheControl string, body []byte) {
	writeBody(w, http.StatusOK, "application/json", cacheControl, body)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeBody(w, status, "application/json", cacheNone, []byte(fmt.Sprintf(`{"error":%q}`, msg)))
}

func writeUpstreamError(w http.ResponseWriter, err error, what string) {
	switch {
	case errors.Is(err, nasa.ErrRateLimited):
		w.Header().Set("Retry-After", "30")
		writeError(w, http.StatusServiceUnavailable, "upstream busy, try again shortly")
	case errors.Is(err, errRecentFailure):
		writeError(w, http.StatusBadGateway, what+" is temporarily unavailable")
	default:
		log.Printf("%s: %v", what, err)
		writeError(w, http.StatusBadGateway, "failed to fetch "+what+" from NASA")
	}
}

func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Expose-Headers", "X-Image-Date")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

func Logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		log.Printf("%s %s %d (%s)", r.Method, r.URL.Path, rec.status, time.Since(start))
	})
}

func parseDateInRange(s string, first, last time.Time) (time.Time, bool) {
	t, err := time.Parse(dateLayout, s)
	if err != nil {
		return time.Time{}, false
	}
	if t.Before(first) || t.After(last) {
		return time.Time{}, false
	}
	return t, true
}

func dayOf(t time.Time) time.Time {
	y, m, d := t.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}

func (d *Deps) Health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, cacheNone, []byte(`{"status":"ok"}`))
}

func (d *Deps) Planets(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, "public, max-age=3600", d.PlanetsJSON)
}

func (d *Deps) Apod(w http.ResponseWriter, r *http.Request) {
	todayET := d.Now().In(easternTime).Format(dateLayout)
	raw := r.URL.Query().Get("date")

	var key, upstreamDate, cacheControl string
	if raw == "" {
		key = "apod/today-" + todayET + ".json"
		cacheControl = cacheShort
	} else {
		last, _ := time.Parse(dateLayout, todayET)
		date, ok := parseDateInRange(raw, apodFirst, last)
		if !ok {
			writeError(w, http.StatusBadRequest, "date must be YYYY-MM-DD between 1995-06-16 and today")
			return
		}
		upstreamDate = date.Format(dateLayout)
		key = "apod/" + upstreamDate + ".json"
		cacheControl = cacheImmutable
		if upstreamDate == todayET {
			cacheControl = cacheShort
		}
	}

	body, err := d.fetchCached(r.Context(), key, func(ctx context.Context) ([]byte, bool, error) {
		body, err := d.Nasa.APOD(ctx, upstreamDate)
		if err != nil {
			return nil, false, err
		}
		if upstreamDate != "" {
			return body, true, nil
		}
		var meta struct {
			Date string `json:"date"`
		}
		cacheable := json.Unmarshal(body, &meta) == nil && meta.Date == todayET
		return body, cacheable, nil
	})
	if err != nil {
		writeUpstreamError(w, err, "APOD")
		return
	}
	writeJSON(w, cacheControl, body)
}

func (d *Deps) Epic(w http.ResponseWriter, r *http.Request) {
	key := "epic/list-" + d.Now().UTC().Format("2006-01-02T15") + ".json"
	body, err := d.fetchCached(r.Context(), key, func(ctx context.Context) ([]byte, bool, error) {
		raw, err := d.Nasa.EPICNatural(ctx)
		if err != nil {
			return nil, false, err
		}
		out, err := rewriteEpicList(raw)
		return out, err == nil, err
	})
	if err != nil {
		writeUpstreamError(w, err, "EPIC data")
		return
	}
	writeJSON(w, cacheShort, body)
}

func rewriteEpicList(raw []byte) ([]byte, error) {
	var items []map[string]any
	if err := json.Unmarshal(raw, &items); err != nil {
		return nil, fmt.Errorf("unexpected EPIC response shape: %w", err)
	}
	for _, item := range items {
		dateStr, _ := item["date"].(string)
		name, _ := item["image"].(string)
		datePart, _, _ := strings.Cut(dateStr, " ")
		parts := strings.Split(datePart, "-")
		if len(parts) == 3 && epicNameRe.MatchString(name) {
			item["imageUrl"] = fmt.Sprintf("/api/epic/image?year=%s&month=%s&day=%s&name=%s", parts[0], parts[1], parts[2], name)
		}
	}
	return json.Marshal(items)
}

func parseEpicImage(year, month, day, name string, today time.Time) (time.Time, string, bool) {
	if !yearRe.MatchString(year) || !twoDigitRe.MatchString(month) || !twoDigitRe.MatchString(day) {
		return time.Time{}, "", false
	}
	date, ok := parseDateInRange(year+"-"+month+"-"+day, epicFirst, today)
	if !ok {
		return time.Time{}, "", false
	}
	m := epicNameRe.FindStringSubmatch(name)
	if m == nil || m[1] != date.Format("20060102") {
		return time.Time{}, "", false
	}
	return date, name, true
}

func (d *Deps) EpicImage(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	date, name, ok := parseEpicImage(q.Get("year"), q.Get("month"), q.Get("day"), q.Get("name"), dayOf(d.Now().UTC()))
	if !ok {
		writeError(w, http.StatusBadRequest, "year, month, day and name must identify a valid EPIC image")
		return
	}

	key := fmt.Sprintf("epic/images/%s.jpg", name)
	body, err := d.fetchCached(r.Context(), key, func(ctx context.Context) ([]byte, bool, error) {
		body, _, err := d.Nasa.EPICImage(ctx, date, name)
		if err != nil {
			return nil, false, err
		}
		if !looksLikeJPEG(body) {
			return nil, false, errors.New("EPIC image is not a JPEG")
		}
		return body, true, nil
	})
	if err != nil {
		writeUpstreamError(w, err, "EPIC image")
		return
	}
	writeBody(w, http.StatusOK, "image/jpeg", cacheImmutable, body)
}

func (d *Deps) Gibs(w http.ResponseWriter, r *http.Request) {
	today := dayOf(d.Now().UTC())
	start := today
	if raw := r.URL.Query().Get("date"); raw != "" {
		parsed, ok := parseDateInRange(raw, gibsFirst, today)
		if !ok {
			writeError(w, http.StatusBadRequest, "date must be YYYY-MM-DD between 2000-02-24 and today")
			return
		}
		start = parsed
	}

	var lastErr error
	for i := 0; i < gibsLookbackDay; i++ {
		day := start.AddDate(0, 0, -i)
		if day.Before(gibsFirst) {
			break
		}
		dateStr := day.Format(dateLayout)
		key := fmt.Sprintf("gibs/%s-%dx%d.jpg", dateStr, gibsWidth, gibsHeight)
		body, err := d.fetchCached(r.Context(), key, func(ctx context.Context) ([]byte, bool, error) {
			body, _, err := d.Nasa.GIBSFullGlobe(ctx, day, gibsWidth, gibsHeight)
			if err != nil {
				return nil, false, err
			}
			if !looksLikeJPEG(body) {
				return nil, false, errors.New("GIBS snapshot is not a JPEG")
			}
			return body, true, nil
		})
		if err == nil {
			w.Header().Set("X-Image-Date", dateStr)
			writeBody(w, http.StatusOK, "image/jpeg", cacheDaily, body)
			return
		}
		lastErr = err
		if errors.Is(err, nasa.ErrRateLimited) {
			break
		}
	}
	if errors.Is(lastErr, nasa.ErrRateLimited) {
		writeUpstreamError(w, lastErr, "GIBS imagery")
		return
	}
	writeError(w, http.StatusBadGateway, "no recent GIBS imagery available")
}

func looksLikeJPEG(b []byte) bool {
	return len(b) > 3 && b[0] == 0xFF && b[1] == 0xD8
}
