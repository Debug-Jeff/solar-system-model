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
	"time"
)

const maxSBDBBytes = 1 << 20

var SmallBodies = map[string]string{"ceres": "1", "halley": "1P", "encke": "2P"}

type Elements struct {
	EpochJD float64 `json:"epochJd"`
	A       float64 `json:"a"`
	E       float64 `json:"e"`
	I       float64 `json:"i"`
	Om      float64 `json:"om"`
	W       float64 `json:"w"`
	Ma      float64 `json:"ma"`
	N       float64 `json:"n"`
}

func (el Elements) Validate() error {
	for _, v := range []float64{el.EpochJD, el.A, el.E, el.I, el.Om, el.W, el.Ma, el.N} {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return errors.New("non-finite orbital element")
		}
	}
	if el.E < 0 || el.E >= 1 {
		return fmt.Errorf("eccentricity %v outside [0, 1)", el.E)
	}
	if el.A <= 0 || el.N <= 0 {
		return errors.New("semi-major axis and mean motion must be positive")
	}
	return nil
}

type SBDB struct {
	Base string
	http *http.Client
}

func NewSBDB() *SBDB {
	return &SBDB{Base: "https://ssd-api.jpl.nasa.gov", http: &http.Client{Timeout: 30 * time.Second}}
}

func (s *SBDB) Elements(ctx context.Context, designation string) (Elements, error) {
	q := url.Values{"sstr": {designation}, "full-prec": {"1"}}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.Base+"/sbdb.api?"+q.Encode(), nil)
	if err != nil {
		return Elements{}, errors.New("building request failed")
	}
	res, err := s.http.Do(req)
	if err != nil {
		return Elements{}, fmt.Errorf("sbdb %s: request failed", designation)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return Elements{}, fmt.Errorf("sbdb %s: upstream responded %d", designation, res.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, maxSBDBBytes))
	if err != nil {
		return Elements{}, fmt.Errorf("sbdb %s: reading response failed", designation)
	}
	var payload struct {
		Orbit struct {
			Epoch    string `json:"epoch"`
			Elements []struct {
				Name  string `json:"name"`
				Value string `json:"value"`
			} `json:"elements"`
		} `json:"orbit"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return Elements{}, fmt.Errorf("sbdb %s: response is not JSON", designation)
	}
	values := map[string]float64{}
	for _, e := range payload.Orbit.Elements {
		if v, err := strconv.ParseFloat(e.Value, 64); err == nil {
			values[e.Name] = v
		}
	}
	epoch, err := strconv.ParseFloat(payload.Orbit.Epoch, 64)
	if err != nil {
		return Elements{}, fmt.Errorf("sbdb %s: missing epoch", designation)
	}
	for _, name := range []string{"a", "e", "i", "om", "w", "ma", "n"} {
		if _, ok := values[name]; !ok {
			return Elements{}, fmt.Errorf("sbdb %s: missing element %s", designation, name)
		}
	}
	el := Elements{EpochJD: epoch, A: values["a"], E: values["e"], I: values["i"], Om: values["om"], W: values["w"], Ma: values["ma"], N: values["n"]}
	if err := el.Validate(); err != nil {
		return Elements{}, fmt.Errorf("sbdb %s: %w", designation, err)
	}
	return el, nil
}
