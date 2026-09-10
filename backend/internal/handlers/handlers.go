// Package handlers implements the HTTP API the frontend talks to.
// It keeps the NASA API key server-side and caches the expensive
// upstream calls (GIBS full-globe mosaics, APOD payloads) to disk.
package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"solarsystem/backend/internal/diskcache"
	"solarsystem/backend/internal/nasa"
)

type Deps struct {
	Nasa        *nasa.Client
	Cache       *diskcache.Cache
	PlanetsJSON []byte
}

func writeJSON(w http.ResponseWriter, status int, body []byte) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	w.Write(body)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, []byte(fmt.Sprintf(`{"error":%q}`, msg)))
}

// CORS allows the Vite dev server (or any origin) to call the API
// directly, in addition to being reachable via the Vite dev proxy.
func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func Logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s (%s)", r.Method, r.URL.Path, time.Since(start))
	})
}

func (d *Deps) Health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, []byte(`{"status":"ok"}`))
}

// Planets serves the static astronomical facts bundled with the backend.
func (d *Deps) Planets(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, d.PlanetsJSON)
}

// Apod proxies NASA's Astronomy Picture of the Day, cached to disk per
// date since a given day's APOD never changes.
func (d *Deps) Apod(w http.ResponseWriter, r *http.Request) {
	date := r.URL.Query().Get("date")
	cacheKey := "apod/" + date + ".json"
	if date == "" {
		cacheKey = "apod/today-" + time.Now().Format("2006-01-02") + ".json"
	}

	if cached, ok := d.Cache.Get(cacheKey); ok {
		writeJSON(w, http.StatusOK, cached)
		return
	}

	body, err := d.Nasa.APOD(date)
	if err != nil {
		log.Printf("apod error: %v", err)
		writeError(w, http.StatusBadGateway, "failed to fetch APOD from NASA")
		return
	}
	d.Cache.Put(cacheKey, body)
	writeJSON(w, http.StatusOK, body)
}

// Epic proxies the latest DSCOVR EPIC natural-color Earth photo
// metadata, rewriting each entry with a ready-to-use image URL that
// points back at our own image proxy (avoids exposing NASA's archive
// URL scheme to the frontend and sidesteps any hotlink/CORS issues).
func (d *Deps) Epic(w http.ResponseWriter, r *http.Request) {
	cacheKey := "epic/list-" + time.Now().Format("2006-01-02T15") + ".json"
	if cached, ok := d.Cache.Get(cacheKey); ok {
		writeJSON(w, http.StatusOK, cached)
		return
	}

	body, err := d.Nasa.EPICNatural()
	if err != nil {
		log.Printf("epic error: %v", err)
		writeError(w, http.StatusBadGateway, "failed to fetch EPIC data from NASA")
		return
	}

	var items []map[string]any
	if err := json.Unmarshal(body, &items); err != nil {
		writeError(w, http.StatusBadGateway, "unexpected EPIC response shape")
		return
	}

	for _, item := range items {
		dateStr, _ := item["date"].(string)
		name, _ := item["image"].(string)
		datePart := strings.SplitN(dateStr, " ", 2)[0]
		parts := strings.Split(datePart, "-")
		if len(parts) == 3 && name != "" {
			item["imageUrl"] = fmt.Sprintf("/api/epic/image?year=%s&month=%s&day=%s&name=%s", parts[0], parts[1], parts[2], name)
		}
	}

	out, err := json.Marshal(items)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to encode EPIC response")
		return
	}
	d.Cache.Put(cacheKey, out)
	writeJSON(w, http.StatusOK, out)
}

// EpicImage streams a single EPIC photo, cached to disk by its NASA
// archive path.
func (d *Deps) EpicImage(w http.ResponseWriter, r *http.Request) {
	year := r.URL.Query().Get("year")
	month := r.URL.Query().Get("month")
	day := r.URL.Query().Get("day")
	name := r.URL.Query().Get("name")
	if year == "" || month == "" || day == "" || name == "" {
		writeError(w, http.StatusBadRequest, "year, month, day and name are required")
		return
	}

	cacheKey := fmt.Sprintf("epic/images/%s-%s-%s-%s.jpg", year, month, day, name)
	if cached, ok := d.Cache.Get(cacheKey); ok {
		w.Header().Set("Content-Type", "image/jpeg")
		w.Write(cached)
		return
	}

	body, contentType, err := d.Nasa.EPICImage(year, month, day, name)
	if err != nil {
		log.Printf("epic image error: %v", err)
		writeError(w, http.StatusBadGateway, "failed to fetch EPIC image from NASA")
		return
	}
	d.Cache.Put(cacheKey, body)
	if contentType == "" {
		contentType = "image/jpeg"
	}
	w.Header().Set("Content-Type", contentType)
	w.Write(body)
}

// Gibs serves a full-globe true-color satellite mosaic for use as a
// "live satellite" Earth texture. Recent imagery can lag by a day or
// two while NASA finishes processing, so it walks backwards from the
// requested date (default: today) until it finds a day with imagery.
func (d *Deps) Gibs(w http.ResponseWriter, r *http.Request) {
	date := r.URL.Query().Get("date")
	if date == "" {
		date = time.Now().UTC().Format("2006-01-02")
	}
	startDate, err := time.Parse("2006-01-02", date)
	if err != nil {
		writeError(w, http.StatusBadRequest, "date must be YYYY-MM-DD")
		return
	}

	const width, height = 4096, 2048
	for i := 0; i < 5; i++ {
		day := startDate.AddDate(0, 0, -i)
		dateStr := day.Format("2006-01-02")
		cacheKey := fmt.Sprintf("gibs/%s-%dx%d.jpg", dateStr, width, height)

		if cached, ok := d.Cache.Get(cacheKey); ok {
			w.Header().Set("X-Image-Date", dateStr)
			w.Header().Set("Content-Type", "image/jpeg")
			w.Write(cached)
			return
		}

		body, _, err := d.Nasa.GIBSFullGlobe(dateStr, width, height)
		if err == nil && looksLikeJPEG(body) {
			d.Cache.Put(cacheKey, body)
			w.Header().Set("X-Image-Date", dateStr)
			w.Header().Set("Content-Type", "image/jpeg")
			w.Write(body)
			return
		}
	}
	writeError(w, http.StatusBadGateway, "no recent GIBS imagery available")
}

func looksLikeJPEG(b []byte) bool {
	return len(b) > 3 && b[0] == 0xFF && b[1] == 0xD8
}
