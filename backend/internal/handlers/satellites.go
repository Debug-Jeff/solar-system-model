package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"solarsystem/backend/internal/celestrak"
)

const (
	cacheSatellites   = "public, max-age=3600"
	satellitesTimeout = 2 * time.Minute
	satellitesSlot    = 2 * time.Hour
)

func satellitesKey(t time.Time) string {
	u := t.UTC()
	return fmt.Sprintf("satellites/%s-%02d.json", u.Format(dateLayout), u.Hour()/2)
}

func (d *Deps) Satellites(w http.ResponseWriter, r *http.Request) {
	if d.Celestrak == nil {
		writeError(w, http.StatusNotFound, "satellites unavailable")
		return
	}
	now := d.Now()
	body, err := d.fetchCached(r.Context(), satellitesKey(now), func(ctx context.Context) ([]byte, bool, error) {
		buildCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), satellitesTimeout)
		defer cancel()
		file, err := celestrak.Build(buildCtx, d.Celestrak, now)
		if err != nil {
			return nil, false, err
		}
		encoded, err := json.Marshal(file)
		return encoded, err == nil, err
	})
	if err != nil {
		if previous, ok := d.Cache.Get(satellitesKey(now.Add(-satellitesSlot))); ok {
			writeJSON(w, cacheSatellites, previous)
			return
		}
		writeUpstreamError(w, err, "satellites")
		return
	}
	writeJSON(w, cacheSatellites, body)
}
