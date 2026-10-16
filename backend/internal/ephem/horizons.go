package ephem

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	maxHorizonsBytes = 8 << 20
	horizonsTimeFmt  = "2006-01-02 15:04"
)

type State struct {
	JD, X, Y, Z, VX, VY, VZ float64
}

type VectorSource interface {
	Vectors(ctx context.Context, command, center string, start, stop time.Time, step time.Duration) ([]State, error)
}

type Horizons struct {
	Base   string
	http   *http.Client
	minGap time.Duration
	mu     sync.Mutex
	last   time.Time
}

func NewHorizons() *Horizons {
	return &Horizons{
		Base:   "https://ssd.jpl.nasa.gov",
		http:   &http.Client{Timeout: 30 * time.Second},
		minGap: 300 * time.Millisecond,
	}
}

func (h *Horizons) Vectors(ctx context.Context, command, center string, start, stop time.Time, step time.Duration) ([]State, error) {
	q := url.Values{}
	q.Set("format", "json")
	q.Set("COMMAND", "'"+command+"'")
	q.Set("CENTER", "'"+center+"'")
	q.Set("EPHEM_TYPE", "VECTORS")
	q.Set("MAKE_EPHEM", "YES")
	q.Set("OBJ_DATA", "NO")
	q.Set("START_TIME", "'"+start.UTC().Format(horizonsTimeFmt)+"'")
	q.Set("STOP_TIME", "'"+stop.UTC().Format(horizonsTimeFmt)+"'")
	q.Set("STEP_SIZE", fmt.Sprintf("'%dm'", int(step/time.Minute)))
	q.Set("REF_PLANE", "ECLIPTIC")
	q.Set("REF_SYSTEM", "ICRF")
	q.Set("OUT_UNITS", "KM-S")
	q.Set("VEC_TABLE", "2")
	q.Set("CSV_FORMAT", "YES")
	q.Set("TIME_TYPE", "UT")

	body, err := h.get(ctx, h.Base+"/api/horizons.api?"+q.Encode())
	if err != nil {
		return nil, fmt.Errorf("horizons %s: %w", command, err)
	}
	var payload struct {
		Result string `json:"result"`
		Error  string `json:"error"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("horizons %s: response is not JSON", command)
	}
	if payload.Error != "" {
		return nil, fmt.Errorf("horizons %s: %s", command, payload.Error)
	}
	states, err := parseVectors(payload.Result)
	if err != nil {
		return nil, fmt.Errorf("horizons %s: %w", command, err)
	}
	return states, nil
}

func (h *Horizons) get(ctx context.Context, rawURL string) ([]byte, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if wait := h.minGap - time.Since(h.last); wait > 0 {
		select {
		case <-time.After(wait):
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	defer func() { h.last = time.Now() }()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, errors.New("building request failed")
	}
	res, err := h.http.Do(req)
	if err != nil {
		var urlErr *url.Error
		if errors.As(err, &urlErr) {
			return nil, fmt.Errorf("request failed: %w", urlErr.Err)
		}
		return nil, errors.New("request failed")
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("upstream responded %d", res.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, maxHorizonsBytes+1))
	if err != nil {
		return nil, errors.New("reading response failed")
	}
	if len(body) > maxHorizonsBytes {
		return nil, errors.New("response too large")
	}
	return body, nil
}

func parseVectors(result string) ([]State, error) {
	_, afterStart, ok := strings.Cut(result, "$$SOE")
	if !ok {
		return nil, errors.New("no $$SOE block")
	}
	block, _, ok := strings.Cut(afterStart, "$$EOE")
	if !ok {
		return nil, errors.New("no $$EOE marker")
	}
	var states []State
	for _, line := range strings.Split(strings.TrimSpace(block), "\n") {
		cols := strings.Split(line, ",")
		if len(cols) < 8 {
			return nil, fmt.Errorf("row has %d columns", len(cols))
		}
		var values [7]float64
		for i, col := range []string{cols[0], cols[2], cols[3], cols[4], cols[5], cols[6], cols[7]} {
			v, err := strconv.ParseFloat(strings.TrimSpace(col), 64)
			if err != nil || math.IsNaN(v) || math.IsInf(v, 0) {
				return nil, fmt.Errorf("bad number %q", strings.TrimSpace(col))
			}
			values[i] = v
		}
		states = append(states, State{JD: values[0], X: values[1], Y: values[2], Z: values[3], VX: values[4], VY: values[5], VZ: values[6]})
	}
	if len(states) == 0 {
		return nil, errors.New("empty vector table")
	}
	return states, nil
}
