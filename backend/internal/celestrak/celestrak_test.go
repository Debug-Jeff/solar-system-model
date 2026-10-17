package celestrak

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

var testNow = time.Date(2026, 10, 17, 6, 0, 0, 0, time.UTC)

type fakeSource struct {
	groups map[string][]OMM
	fail   string
	calls  []string
}

func (f *fakeSource) FetchGroup(_ context.Context, group string) ([]OMM, error) {
	f.calls = append(f.calls, group)
	if group == f.fail {
		return nil, errors.New("upstream responded 503")
	}
	return f.groups[group], nil
}

func sampleOMM(norad int, name string) OMM {
	return OMM{
		ObjectName: name, ObjectID: "1998-067A", Epoch: "2026-10-16T18:57:11.728512",
		MeanMotion: 15.48899044, Eccentricity: 0.00067481, Inclination: 51.6326,
		RAOfAscNode: 58.3278, ArgOfPericenter: 271.9059, MeanAnomaly: 88.1156,
		EphemerisType: 0, ClassificationType: "U", NoradCatID: norad, ElementSetNo: 999,
		RevAtEpoch: 59060, Bstar: 0.0001501181, MeanMotionDot: 0.00007803, MeanMotionDDot: 0,
	}
}

func fullSource() *fakeSource {
	groups := map[string][]OMM{}
	for _, s := range Registry {
		groups[s.Group] = append(groups[s.Group], sampleOMM(s.NORAD, strings.ToUpper(s.ID)))
	}
	return &fakeSource{groups: groups}
}

func ids(file File) []string {
	out := make([]string, len(file.Satellites))
	for i, s := range file.Satellites {
		out[i] = s.ID
	}
	return out
}

func registryIDs() []string {
	out := make([]string, len(Registry))
	for i, s := range Registry {
		out[i] = s.ID
	}
	return out
}

func init() { FetchGap = 0 }

func TestRegistryIsSafe(t *testing.T) {
	idRE := regexp.MustCompile(`^[a-z0-9-]{1,32}$`)
	allowed := map[string]bool{"stations": true, "science": true, "resource": true, "weather": true, "gps-ops": true, "galileo": true, "iridium-NEXT": true, "tdrss": true}
	seenID := map[string]bool{}
	seenNorad := map[int]bool{}
	for _, s := range Registry {
		if !idRE.MatchString(s.ID) || seenID[s.ID] {
			t.Errorf("bad or duplicate id %q", s.ID)
		}
		if s.NORAD <= 0 || seenNorad[s.NORAD] {
			t.Errorf("bad or duplicate NORAD %d", s.NORAD)
		}
		if !allowed[s.Group] {
			t.Errorf("%s: group %q not allowlisted", s.ID, s.Group)
		}
		seenID[s.ID], seenNorad[s.NORAD] = true, true
	}
	if len(Registry) < 20 || len(Registry) > 40 {
		t.Fatalf("registry has %d satellites, want 20–40", len(Registry))
	}
}

func TestGroupsAreSortedAndUnique(t *testing.T) {
	g := Groups()
	if !slices.IsSorted(g) || len(slices.Compact(slices.Clone(g))) != len(g) {
		t.Fatalf("groups %v", g)
	}
}

func TestBuildKeepsRegistryOrderAndFetchesEachGroupOnce(t *testing.T) {
	src := fullSource()
	file, err := Build(context.Background(), src, testNow)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(ids(file), registryIDs()) {
		t.Fatalf("ids %v", ids(file))
	}
	if !slices.Equal(src.calls, Groups()) {
		t.Fatalf("calls %v, want %v", src.calls, Groups())
	}
	if file.Version != 1 || file.GeneratedAt != "2026-10-17T06:00:00Z" {
		t.Fatalf("header %d %s", file.Version, file.GeneratedAt)
	}
}

func TestBuildDropsInvalidElements(t *testing.T) {
	cases := map[string]func(*OMM){
		"unparseable epoch":   func(o *OMM) { o.Epoch = "yesterday" },
		"epoch too old":       func(o *OMM) { o.Epoch = "2026-09-10T00:00:00.000000" },
		"epoch in the future": func(o *OMM) { o.Epoch = "2026-10-19T00:00:00.000000" },
		"eccentricity 1":      func(o *OMM) { o.Eccentricity = 1 },
		"negative ecc":        func(o *OMM) { o.Eccentricity = -0.1 },
		"zero mean motion":    func(o *OMM) { o.MeanMotion = 0 },
		"mean motion 25":      func(o *OMM) { o.MeanMotion = 25 },
		"inclination 181":     func(o *OMM) { o.Inclination = 181 },
		"node 360":            func(o *OMM) { o.RAOfAscNode = 360 },
		"perigee -1":          func(o *OMM) { o.ArgOfPericenter = -1 },
		"anomaly 400":         func(o *OMM) { o.MeanAnomaly = 400 },
		"bstar 1.5":           func(o *OMM) { o.Bstar = 1.5 },
		"long name":           func(o *OMM) { o.ObjectName = strings.Repeat("X", 41) },
		"control char name":   func(o *OMM) { o.ObjectName = "ISS\u0007" },
		"markup name":         func(o *OMM) { o.ObjectName = "<img src=x>" },
		"long object id":      func(o *OMM) { o.ObjectID = strings.Repeat("9", 17) },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			src := fullSource()
			mutate(&src.groups["stations"][0])
			file, err := Build(context.Background(), src, testNow)
			if err != nil {
				t.Fatal(err)
			}
			if slices.Contains(ids(file), "iss") || len(file.Satellites) != len(Registry)-1 {
				t.Fatalf("ids %v", ids(file))
			}
		})
	}
}

func TestBuildSkipsMissingAndIgnoresUnknownSatellites(t *testing.T) {
	src := fullSource()
	science := src.groups["science"]
	src.groups["science"] = slices.DeleteFunc(slices.Clone(science), func(o OMM) bool { return o.NoradCatID == 20580 })
	src.groups["stations"] = append(src.groups["stations"], sampleOMM(99999, "STRANGER"))
	file, err := Build(context.Background(), src, testNow)
	if err != nil {
		t.Fatal(err)
	}
	if slices.Contains(ids(file), "hubble") || len(file.Satellites) != len(Registry)-1 {
		t.Fatalf("ids %v", ids(file))
	}
	for _, s := range file.Satellites {
		if s.OMM.NoradCatID == 99999 {
			t.Fatal("unknown satellite passed through")
		}
	}
}

func TestBuildUsesRegistryNoradNotDuplicates(t *testing.T) {
	src := fullSource()
	src.groups["tdrss"] = append(src.groups["tdrss"], sampleOMM(25544, "ISS (ZARYA)"))
	file, err := Build(context.Background(), src, testNow)
	if err != nil {
		t.Fatal(err)
	}
	if len(file.Satellites) != len(Registry) {
		t.Fatalf("got %d satellites", len(file.Satellites))
	}
}

func TestGroupErrorFailsTheBuild(t *testing.T) {
	src := fullSource()
	src.fail = "weather"
	if _, err := Build(context.Background(), src, testNow); err == nil {
		t.Fatal("a failed group must fail the build so partial data is never cached")
	}
}

func TestZeroSatellitesIsAnError(t *testing.T) {
	if _, err := Build(context.Background(), &fakeSource{groups: map[string][]OMM{}}, testNow); err == nil {
		t.Fatal("expected an error")
	}
}

func TestBuildHonoursCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := Build(ctx, fullSource(), testNow); err == nil {
		t.Fatal("expected a context error")
	}
}

func testClient(t *testing.T, handler http.HandlerFunc) (*Client, *atomic.Int64) {
	t.Helper()
	var hits atomic.Int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		handler(w, r)
	}))
	t.Cleanup(srv.Close)
	c := New()
	c.BaseURL = srv.URL
	return c, &hits
}

func TestFetchGroupRejectsUnknownGroupsWithoutARequest(t *testing.T) {
	c, hits := testClient(t, func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("[]")) })
	for _, g := range []string{"active", "starlink", "weather&FORMAT=tle", ""} {
		if _, err := c.FetchGroup(context.Background(), g); err == nil {
			t.Errorf("%q accepted", g)
		}
	}
	if hits.Load() != 0 {
		t.Fatalf("%d requests made", hits.Load())
	}
}

func TestFetchGroupBuildsTheQueryAndDecodes(t *testing.T) {
	c, _ := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		if q.Get("GROUP") != "weather" || q.Get("FORMAT") != "json" || len(q) != 2 || r.Header.Get("User-Agent") == "" {
			http.Error(w, "bad query", http.StatusBadRequest)
			return
		}
		_, _ = w.Write([]byte(`[{"OBJECT_NAME":"GOES 19","OBJECT_ID":"2024-119A","EPOCH":"2026-10-16T05:00:00.000000","MEAN_MOTION":1.00271,"ECCENTRICITY":0.0001,"INCLINATION":0.05,"RA_OF_ASC_NODE":90,"ARG_OF_PERICENTER":10,"MEAN_ANOMALY":200,"EPHEMERIS_TYPE":0,"CLASSIFICATION_TYPE":"U","NORAD_CAT_ID":60133,"ELEMENT_SET_NO":999,"REV_AT_EPOCH":800,"BSTAR":0,"MEAN_MOTION_DOT":-0.00000276,"MEAN_MOTION_DDOT":0}]`))
	})
	got, err := c.FetchGroup(context.Background(), "weather")
	if err != nil || len(got) != 1 || got[0].NoradCatID != 60133 || got[0].MeanMotion != 1.00271 {
		t.Fatalf("%v %+v", err, got)
	}
}

func TestFetchGroupFailures(t *testing.T) {
	cases := map[string]http.HandlerFunc{
		"non-200":  func(w http.ResponseWriter, r *http.Request) { http.Error(w, "down", http.StatusServiceUnavailable) },
		"bad json": func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte("Invalid query")) },
		"oversized": func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte("[" + strings.Repeat(" ", MaxGroupBytes) + "]"))
		},
	}
	for name, h := range cases {
		t.Run(name, func(t *testing.T) {
			c, _ := testClient(t, h)
			_, err := c.FetchGroup(context.Background(), "weather")
			if err == nil {
				t.Fatal("expected an error")
			}
			if strings.Contains(err.Error(), "127.0.0.1") || strings.Contains(err.Error(), "GROUP=") {
				t.Fatalf("error leaks the URL: %v", err)
			}
		})
	}
}

func TestFrontendCatalogueMatchesRegistry(t *testing.T) {
	src, err := os.ReadFile("../../../frontend/src/satellites/catalogue.ts")
	if err != nil {
		t.Fatal(err)
	}
	catalogue := map[string]int{}
	for _, m := range regexp.MustCompile(`id: '([a-z0-9-]+)', name: '[^']+', norad: ([0-9]+)`).FindAllStringSubmatch(string(src), -1) {
		n, _ := strconv.Atoi(m[2])
		catalogue[m[1]] = n
	}
	if len(catalogue) != len(Registry) {
		t.Fatalf("catalogue has %d satellites, registry %d", len(catalogue), len(Registry))
	}
	for _, s := range Registry {
		if catalogue[s.ID] != s.NORAD {
			t.Errorf("%s: catalogue NORAD %d, registry %d", s.ID, catalogue[s.ID], s.NORAD)
		}
	}
}
