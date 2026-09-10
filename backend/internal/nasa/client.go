// Package nasa is a thin client for the NASA APIs used by the solar
// system demo: APOD, EPIC (real DSCOVR satellite photos of Earth), and
// GIBS (Worldview Snapshot full-globe satellite mosaics).
package nasa

import (
	"fmt"
	"io"
	"net/http"
	"time"
)

type Client struct {
	APIKey string
	http   *http.Client
}

func NewClient(apiKey string) *Client {
	return &Client{
		APIKey: apiKey,
		http:   &http.Client{Timeout: 20 * time.Second},
	}
}

func (c *Client) get(url string) ([]byte, string, error) {
	resp, err := c.http.Get(url)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("nasa upstream %s returned %d: %s", url, resp.StatusCode, string(body))
	}
	return body, resp.Header.Get("Content-Type"), nil
}

// APOD fetches the Astronomy Picture of the Day. date is optional
// (YYYY-MM-DD); empty means "today".
func (c *Client) APOD(date string) ([]byte, error) {
	url := fmt.Sprintf("https://api.nasa.gov/planetary/apod?api_key=%s", c.APIKey)
	if date != "" {
		url += "&date=" + date
	}
	body, _, err := c.get(url)
	return body, err
}

// EPICNatural fetches the metadata list for the most recent day of
// natural-color full-Earth photos from the DSCOVR EPIC camera.
func (c *Client) EPICNatural() ([]byte, error) {
	body, _, err := c.get("https://epic.gsfc.nasa.gov/api/natural")
	return body, err
}

// EPICImage fetches a single EPIC photo (jpg) given its date parts and
// image identifier, as returned in the EPICNatural metadata.
func (c *Client) EPICImage(year, month, day, name string) ([]byte, string, error) {
	url := fmt.Sprintf("https://epic.gsfc.nasa.gov/archive/natural/%s/%s/%s/jpg/%s.jpg", year, month, day, name)
	return c.get(url)
}

// GIBSFullGlobe fetches a full-globe true-color satellite mosaic for
// the given date (YYYY-MM-DD) from NASA's GIBS Worldview Snapshot
// service, sized for use as an equirectangular sphere texture.
func (c *Client) GIBSFullGlobe(date string, width, height int) ([]byte, string, error) {
	url := fmt.Sprintf(
		"https://wvs.earthdata.nasa.gov/api/v1/snapshot?REQUEST=GetSnapshot&LAYERS=MODIS_Terra_CorrectedReflectance_TrueColor&CRS=EPSG:4326&TIME=%s&BBOX=-90,-180,90,180&FORMAT=image/jpeg&WIDTH=%d&HEIGHT=%d",
		date, width, height,
	)
	return c.get(url)
}
