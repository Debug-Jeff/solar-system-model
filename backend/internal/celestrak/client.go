package celestrak

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"slices"
	"time"
	"unicode"
)

const (
	userAgent   = "solar-system-model/1.0 (+https://github.com/Debug-Jeff/solar-system-model)"
	epochLayout = "2006-01-02T15:04:05.999999"
	maxNameLen  = 40
	maxIDLen    = 16
)

var (
	MaxGroupBytes = 4 << 20
	FetchGap      = time.Second
)

type OMM struct {
	ObjectName         string  `json:"OBJECT_NAME"`
	ObjectID           string  `json:"OBJECT_ID"`
	Epoch              string  `json:"EPOCH"`
	MeanMotion         float64 `json:"MEAN_MOTION"`
	Eccentricity       float64 `json:"ECCENTRICITY"`
	Inclination        float64 `json:"INCLINATION"`
	RAOfAscNode        float64 `json:"RA_OF_ASC_NODE"`
	ArgOfPericenter    float64 `json:"ARG_OF_PERICENTER"`
	MeanAnomaly        float64 `json:"MEAN_ANOMALY"`
	EphemerisType      int     `json:"EPHEMERIS_TYPE"`
	ClassificationType string  `json:"CLASSIFICATION_TYPE"`
	NoradCatID         int     `json:"NORAD_CAT_ID"`
	ElementSetNo       int     `json:"ELEMENT_SET_NO"`
	RevAtEpoch         int     `json:"REV_AT_EPOCH"`
	Bstar              float64 `json:"BSTAR"`
	MeanMotionDot      float64 `json:"MEAN_MOTION_DOT"`
	MeanMotionDDot     float64 `json:"MEAN_MOTION_DDOT"`
}

type Satellite struct {
	ID  string `json:"id"`
	OMM OMM    `json:"omm"`
}

type File struct {
	Version     int         `json:"version"`
	GeneratedAt string      `json:"generatedAt"`
	Satellites  []Satellite `json:"satellites"`
}

type GroupSource interface {
	FetchGroup(ctx context.Context, group string) ([]OMM, error)
}

type Client struct {
	HTTP    *http.Client
	BaseURL string
}

func New() *Client {
	return &Client{HTTP: &http.Client{Timeout: 30 * time.Second}, BaseURL: "https://celestrak.org/NORAD/elements/gp.php"}
}

func (c *Client) FetchGroup(ctx context.Context, group string) ([]OMM, error) {
	if !slices.Contains(Groups(), group) {
		return nil, fmt.Errorf("group %q is not allowlisted", group)
	}
	u, err := url.Parse(c.BaseURL)
	if err != nil {
		return nil, errors.New("bad base URL")
	}
	u.RawQuery = url.Values{"GROUP": {group}, "FORMAT": {"json"}}.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, errors.New("building request failed")
	}
	req.Header.Set("User-Agent", userAgent)
	res, err := c.HTTP.Do(req)
	if err != nil {
		var urlErr *url.Error
		if errors.As(err, &urlErr) {
			return nil, fmt.Errorf("celestrak %s: request failed: %w", group, urlErr.Err)
		}
		return nil, fmt.Errorf("celestrak %s: request failed", group)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("celestrak %s: upstream responded %d", group, res.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, int64(MaxGroupBytes)+1))
	if err != nil {
		return nil, fmt.Errorf("celestrak %s: reading response failed", group)
	}
	if len(body) > MaxGroupBytes {
		return nil, fmt.Errorf("celestrak %s: response too large", group)
	}
	var out []OMM
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, fmt.Errorf("celestrak %s: response is not OMM JSON", group)
	}
	return out, nil
}

func printable(s string, max int) bool {
	if s == "" || len(s) > max {
		return false
	}
	for _, r := range s {
		if r > unicode.MaxASCII || !unicode.IsPrint(r) || r == '<' || r == '>' || r == '&' || r == '"' {
			return false
		}
	}
	return true
}

func angle(v float64) bool { return v >= 0 && v < 360 }

func validate(o OMM, now time.Time) error {
	epoch, err := time.Parse(epochLayout, o.Epoch)
	if err != nil {
		return errors.New("unparseable epoch")
	}
	if epoch.Before(now.AddDate(0, 0, -30)) || epoch.After(now.AddDate(0, 0, 1)) {
		return errors.New("epoch out of range")
	}
	switch {
	case !(o.MeanMotion > 0 && o.MeanMotion <= 20):
		return errors.New("mean motion out of range")
	case !(o.Eccentricity >= 0 && o.Eccentricity < 1):
		return errors.New("eccentricity out of range")
	case !(o.Inclination >= 0 && o.Inclination <= 180):
		return errors.New("inclination out of range")
	case !angle(o.RAOfAscNode) || !angle(o.ArgOfPericenter) || !angle(o.MeanAnomaly):
		return errors.New("angle out of range")
	case !(o.Bstar > -1 && o.Bstar < 1):
		return errors.New("bstar out of range")
	case !printable(o.ObjectName, maxNameLen) || !printable(o.ObjectID, maxIDLen):
		return errors.New("bad name")
	}
	return nil
}

func wait(ctx context.Context, d time.Duration) error {
	if d <= 0 {
		return ctx.Err()
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

func Build(ctx context.Context, src GroupSource, now time.Time) (File, error) {
	byNorad := map[int]OMM{}
	for i, group := range Groups() {
		if i > 0 {
			if err := wait(ctx, FetchGap); err != nil {
				return File{}, err
			}
		} else if err := ctx.Err(); err != nil {
			return File{}, err
		}
		omms, err := src.FetchGroup(ctx, group)
		if err != nil {
			return File{}, err
		}
		for _, o := range omms {
			if _, seen := byNorad[o.NoradCatID]; !seen {
				byNorad[o.NoradCatID] = o
			}
		}
	}
	file := File{Version: 1, GeneratedAt: now.UTC().Format(time.RFC3339), Satellites: []Satellite{}}
	for _, s := range Registry {
		o, ok := byNorad[s.NORAD]
		if !ok {
			log.Printf("satellite %s (%d) missing from group %s; skipped", s.ID, s.NORAD, s.Group)
			continue
		}
		if err := validate(o, now); err != nil {
			log.Printf("satellite %s rejected: %v", s.ID, err)
			continue
		}
		file.Satellites = append(file.Satellites, Satellite{ID: s.ID, OMM: o})
	}
	if len(file.Satellites) == 0 {
		return File{}, errors.New("no satellites in the CelesTrak response")
	}
	return file, nil
}
