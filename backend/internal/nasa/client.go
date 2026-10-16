package nasa

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"golang.org/x/time/rate"
)

const maxBodyBytes = 32 << 20

var ErrRateLimited = errors.New("upstream request budget exhausted")

type Client struct {
	APIKey   string
	APODBase string
	EPICBase string
	GIBSBase string
	http     *http.Client
	limiter  *rate.Limiter
}

func NewClient(apiKey string) *Client {
	return &Client{
		APIKey:   apiKey,
		APODBase: "https://api.nasa.gov",
		EPICBase: "https://epic.gsfc.nasa.gov",
		GIBSBase: "https://wvs.earthdata.nasa.gov",
		http:     &http.Client{Timeout: 20 * time.Second},
		limiter:  rate.NewLimiter(rate.Every(4*time.Second), 10),
	}
}

func (c *Client) SetRateLimit(limit rate.Limit, burst int) {
	c.limiter = rate.NewLimiter(limit, burst)
}

func (c *Client) get(ctx context.Context, rawURL string) ([]byte, string, error) {
	if !c.limiter.Allow() {
		return nil, "", ErrRateLimited
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, "", err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		var urlErr *url.Error
		if errors.As(err, &urlErr) {
			return nil, "", fmt.Errorf("nasa upstream %s: %w", req.URL.Host, urlErr.Err)
		}
		return nil, "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxBodyBytes+1))
	if err != nil {
		return nil, "", err
	}
	if len(body) > maxBodyBytes {
		return nil, "", fmt.Errorf("nasa upstream %s: response exceeds %d bytes", req.URL.Host, maxBodyBytes)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("nasa upstream %s%s returned %d", req.URL.Host, req.URL.Path, resp.StatusCode)
	}
	return body, resp.Header.Get("Content-Type"), nil
}

func (c *Client) APOD(ctx context.Context, date string) ([]byte, error) {
	q := url.Values{"api_key": {c.APIKey}}
	if date != "" {
		q.Set("date", date)
	}
	body, _, err := c.get(ctx, c.APODBase+"/planetary/apod?"+q.Encode())
	return body, err
}

func (c *Client) EPICNatural(ctx context.Context) ([]byte, error) {
	body, _, err := c.get(ctx, c.EPICBase+"/api/natural")
	return body, err
}

func (c *Client) EPICImage(ctx context.Context, date time.Time, name string) ([]byte, string, error) {
	u := fmt.Sprintf("%s/archive/natural/%s/jpg/%s.jpg", c.EPICBase, date.Format("2006/01/02"), url.PathEscape(name))
	return c.get(ctx, u)
}

func (c *Client) GIBSFullGlobe(ctx context.Context, date time.Time, width, height int) ([]byte, string, error) {
	q := url.Values{
		"REQUEST": {"GetSnapshot"},
		"LAYERS":  {"MODIS_Terra_CorrectedReflectance_TrueColor"},
		"CRS":     {"EPSG:4326"},
		"TIME":    {date.Format("2006-01-02")},
		"BBOX":    {"-90,-180,90,180"},
		"FORMAT":  {"image/jpeg"},
		"WIDTH":   {fmt.Sprint(width)},
		"HEIGHT":  {fmt.Sprint(height)},
	}
	return c.get(ctx, c.GIBSBase+"/api/v1/snapshot?"+q.Encode())
}
