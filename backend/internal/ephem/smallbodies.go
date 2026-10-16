package ephem

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"time"
)

const (
	mainBeltLimit   = 3000
	kuiperBeltLimit = 1500
	maxNeos         = 15
	maxNeoWsBytes   = 8 << 20
	maxQueryBytes   = 8 << 20
)

type NamedSpec struct {
	ID          string
	Name        string
	Type        string
	Designation string
}

var NamedSmallBodies = []NamedSpec{
	{"eris", "Eris", "dwarfPlanet", "136199"},
	{"haumea", "Haumea", "dwarfPlanet", "136108"},
	{"makemake", "Makemake", "dwarfPlanet", "136472"},
	{"vesta", "Vesta", "asteroid", "4"},
	{"pallas", "Pallas", "asteroid", "2"},
	{"juno", "Juno", "asteroid", "3"},
	{"hygiea", "Hygiea", "asteroid", "10"},
	{"psyche", "Psyche", "asteroid", "16"},
	{"eros", "Eros", "asteroid", "433"},
	{"bennu", "Bennu", "asteroid", "101955"},
	{"ryugu", "Ryugu", "asteroid", "162173"},
	{"apophis", "Apophis", "asteroid", "99942"},
	{"didymos", "Didymos", "asteroid", "65803"},
	{"itokawa", "Itokawa", "asteroid", "25143"},
	{"lutetia", "Lutetia", "asteroid", "21"},
	{"ida", "Ida", "asteroid", "243"},
	{"mathilde", "Mathilde", "asteroid", "253"},
	{"gaspra", "Gaspra", "asteroid", "951"},
	{"steins", "Šteins", "asteroid", "2867"},
	{"arrokoth", "Arrokoth", "asteroid", "486958"},
	{"tempel1", "Comet Tempel 1", "comet", "9P"},
	{"67p", "Comet 67P/Churyumov–Gerasimenko", "comet", "67P"},
	{"wild2", "Comet Wild 2", "comet", "81P"},
	{"borrelly", "Comet Borrelly", "comet", "19P"},
	{"hartley2", "Comet Hartley 2", "comet", "103P"},
}

var defaultRadiusKm = map[string]float64{"asteroid": 1, "comet": 2, "dwarfPlanet": 600}

type NamedBody struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Type        string   `json:"type"`
	Designation string   `json:"designation"`
	RadiusKm    float64  `json:"radiusKm"`
	Elements    Elements `json:"elements"`
}

type Belt struct {
	Count int       `json:"count"`
	Rows  []float64 `json:"rows"`
}

type NeoApproach struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	ApproachMs int64    `json:"approachMs"`
	MissKm     float64  `json:"missKm"`
	SpeedKmS   float64  `json:"speedKmS"`
	DiameterKm float64  `json:"diameterKm"`
	Hazardous  bool     `json:"hazardous"`
	Elements   Elements `json:"elements"`
	refID      string
}

type SmallBodiesFile struct {
	Version     int         `json:"version"`
	GeneratedAt string      `json:"generatedAt"`
	Named       []NamedBody `json:"named"`
	Belts       struct {
		Main   Belt `json:"main"`
		Kuiper Belt `json:"kuiper"`
	} `json:"belts"`
	Neos []NeoApproach `json:"neos"`
}

func fetchCapped(ctx context.Context, client *http.Client, rawURL string, limit int64) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, errors.New("building request failed")
	}
	res, err := client.Do(req)
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
	body, err := io.ReadAll(io.LimitReader(res.Body, limit+1))
	if err != nil {
		return nil, errors.New("reading response failed")
	}
	if int64(len(body)) > limit {
		return nil, errors.New("response too large")
	}
	return body, nil
}

func (s *SBDB) Query(ctx context.Context, class string, limit int) ([][8]float64, error) {
	q := url.Values{"fields": {"a,e,i,om,w,ma,n,epoch"}, "sb-class": {class}, "limit": {strconv.Itoa(limit)}}
	body, err := fetchCapped(ctx, s.http, s.Base+"/sbdb_query.api?"+q.Encode(), maxQueryBytes)
	if err != nil {
		return nil, fmt.Errorf("sbdb query %s: %w", class, err)
	}
	var payload struct {
		Data [][]*string `json:"data"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("sbdb query %s: response is not JSON", class)
	}
	var rows [][8]float64
	for _, raw := range payload.Data {
		if row, ok := parseQueryRow(raw); ok {
			rows = append(rows, row)
		}
	}
	return rows, nil
}

func parseQueryRow(raw []*string) ([8]float64, bool) {
	var row [8]float64
	if len(raw) != 8 {
		return row, false
	}
	for i, cell := range raw {
		if cell == nil {
			return row, false
		}
		v, err := strconv.ParseFloat(*cell, 64)
		if err != nil || math.IsNaN(v) || math.IsInf(v, 0) {
			return row, false
		}
		row[i] = v
	}
	el := Elements{A: row[0], E: row[1], I: row[2], Om: row[3], W: row[4], Ma: row[5], N: row[6], EpochJD: row[7]}
	return row, el.Validate() == nil
}

func (s *SBDB) Body(ctx context.Context, designation string) (Elements, float64, error) {
	q := url.Values{"sstr": {designation}, "full-prec": {"1"}, "phys-par": {"1"}}
	body, err := fetchCapped(ctx, s.http, s.Base+"/sbdb.api?"+q.Encode(), maxSBDBBytes)
	if err != nil {
		return Elements{}, 0, fmt.Errorf("sbdb %s: %w", designation, err)
	}
	el, err := parseSBDBElements(body, designation)
	if err != nil {
		return Elements{}, 0, err
	}
	var phys struct {
		PhysPar []struct {
			Name  string `json:"name"`
			Value string `json:"value"`
		} `json:"phys_par"`
	}
	_ = json.Unmarshal(body, &phys)
	for _, p := range phys.PhysPar {
		if p.Name == "diameter" {
			if d, err := strconv.ParseFloat(p.Value, 64); err == nil && d > 0 && !math.IsInf(d, 0) {
				return el, d / 2, nil
			}
		}
	}
	return el, 0, nil
}

type NeoWs struct {
	Base string
	http *http.Client
}

func NewNeoWs() *NeoWs {
	return &NeoWs{Base: "https://api.nasa.gov", http: &http.Client{Timeout: 30 * time.Second}}
}

func (n *NeoWs) Feed(ctx context.Context, key string, start, end time.Time) ([]NeoApproach, error) {
	q := url.Values{"start_date": {start.Format("2006-01-02")}, "end_date": {end.Format("2006-01-02")}, "api_key": {key}}
	body, err := fetchCapped(ctx, n.http, n.Base+"/neo/rest/v1/feed?"+q.Encode(), maxNeoWsBytes)
	if err != nil {
		return nil, fmt.Errorf("neows feed: %w", err)
	}
	var payload struct {
		Objects map[string][]struct {
			RefID     string `json:"neo_reference_id"`
			Name      string `json:"name"`
			Hazardous bool   `json:"is_potentially_hazardous_asteroid"`
			Diameter  struct {
				Km struct {
					Min float64 `json:"estimated_diameter_min"`
					Max float64 `json:"estimated_diameter_max"`
				} `json:"kilometers"`
			} `json:"estimated_diameter"`
			Approaches []struct {
				EpochMs  int64 `json:"epoch_date_close_approach"`
				Velocity struct {
					KmS string `json:"kilometers_per_second"`
				} `json:"relative_velocity"`
				Miss struct {
					Km string `json:"kilometers"`
				} `json:"miss_distance"`
				Body string `json:"orbiting_body"`
			} `json:"close_approach_data"`
		} `json:"near_earth_objects"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, errors.New("neows feed: response is not JSON")
	}
	var out []NeoApproach
	for _, day := range payload.Objects {
		for _, o := range day {
			for _, ca := range o.Approaches {
				miss, err1 := strconv.ParseFloat(ca.Miss.Km, 64)
				speed, err2 := strconv.ParseFloat(ca.Velocity.KmS, 64)
				if ca.Body != "Earth" || err1 != nil || err2 != nil || o.RefID == "" {
					continue
				}
				out = append(out, NeoApproach{
					ID:         "neo-" + o.RefID,
					Name:       o.Name,
					ApproachMs: ca.EpochMs,
					MissKm:     math.Round(miss),
					SpeedKmS:   round(speed, 1000),
					DiameterKm: round((o.Diameter.Km.Min+o.Diameter.Km.Max)/2, 10000),
					Hazardous:  o.Hazardous,
					refID:      o.RefID,
				})
			}
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].MissKm < out[j].MissKm })
	return out, nil
}

func roundElements(el Elements) Elements {
	return Elements{EpochJD: el.EpochJD, A: round(el.A, 1e8), E: round(el.E, 1e8), I: round(el.I, 1e6), Om: round(el.Om, 1e6), W: round(el.W, 1e6), Ma: round(el.Ma, 1e6), N: round(el.N, 1e10)}
}

func beltOf(rows [][8]float64) Belt {
	flat := make([]float64, 0, len(rows)*8)
	for _, r := range rows {
		flat = append(flat, round(r[0], 1e4), round(r[1], 1e4), round(r[2], 100), round(r[3], 100), round(r[4], 100), round(r[5], 100), round(r[6], 1e6), r[7])
	}
	return Belt{Count: len(rows), Rows: flat}
}

func BuildSmallBodies(ctx context.Context, sbdb *SBDB, neows *NeoWs, key string, now time.Time) (SmallBodiesFile, error) {
	file := SmallBodiesFile{Version: 1, GeneratedAt: now.UTC().Format(time.RFC3339), Neos: []NeoApproach{}}
	for _, spec := range NamedSmallBodies {
		el, radius, err := sbdb.Body(ctx, spec.Designation)
		if err != nil {
			return SmallBodiesFile{}, err
		}
		if radius == 0 {
			radius = defaultRadiusKm[spec.Type]
		}
		file.Named = append(file.Named, NamedBody{ID: spec.ID, Name: spec.Name, Type: spec.Type, Designation: spec.Designation, RadiusKm: round(radius, 10), Elements: roundElements(el)})
	}
	mainRows, err := sbdb.Query(ctx, "MBA", mainBeltLimit)
	if err != nil {
		return SmallBodiesFile{}, err
	}
	kuiperRows, err := sbdb.Query(ctx, "TNO", kuiperBeltLimit)
	if err != nil {
		return SmallBodiesFile{}, err
	}
	file.Belts.Main = beltOf(mainRows)
	file.Belts.Kuiper = beltOf(kuiperRows)

	if key == "" {
		log.Printf("small bodies: no NASA key, skipping near-Earth objects")
		return file, nil
	}
	day := now.UTC().Truncate(24 * time.Hour)
	approaches, err := neows.Feed(ctx, key, day, day.AddDate(0, 0, 7))
	if err != nil {
		log.Printf("small bodies: %v", err)
		return file, nil
	}
	for _, a := range approaches {
		if len(file.Neos) == maxNeos {
			break
		}
		el, _, err := sbdb.Body(ctx, a.refID)
		if err != nil {
			log.Printf("small bodies: skipping %s: %v", a.ID, err)
			continue
		}
		a.Elements = roundElements(el)
		file.Neos = append(file.Neos, a)
	}
	return file, nil
}
