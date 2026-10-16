package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"solarsystem/backend/internal/ephem"
	"solarsystem/backend/internal/nasa"
)

const (
	cacheEphem   = "public, max-age=21600"
	ephemTimeout = 5 * time.Minute
)

func isBudgetError(err error) bool {
	return errors.Is(err, nasa.ErrRateLimited) || errors.Is(err, ephem.ErrBudgetExhausted)
}

func ephemKey(set string, day time.Time) string {
	return "ephem/" + set + "-" + day.UTC().Format(dateLayout) + ".json"
}

func (d *Deps) Ephem(w http.ResponseWriter, r *http.Request) {
	set := r.PathValue("set")
	if _, ok := ephem.Sets[set]; !ok || d.Horizons == nil {
		writeError(w, http.StatusNotFound, "unknown ephemeris set")
		return
	}
	now := d.Now()
	body, err := d.fetchCached(r.Context(), ephemKey(set, now), func(ctx context.Context) ([]byte, bool, error) {
		buildCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), ephemTimeout)
		defer cancel()
		file, err := ephem.BuildSet(buildCtx, d.Horizons, set, now)
		if err != nil {
			return nil, false, err
		}
		encoded, err := json.Marshal(file)
		return encoded, err == nil, err
	})
	if err != nil {
		if previous, ok := d.Cache.Get(ephemKey(set, now.AddDate(0, 0, -1))); ok {
			writeJSON(w, cacheEphem, previous)
			return
		}
		writeUpstreamError(w, err, "ephemeris")
		return
	}
	writeJSON(w, cacheEphem, body)
}
