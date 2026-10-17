package ephem

import (
	"context"
	"errors"
	"os"
	"regexp"
	"testing"
	"time"
)

type fakeSource struct {
	fail  string
	calls int
}

func (f *fakeSource) Vectors(_ context.Context, command, _ string, start, stop time.Time, step time.Duration) ([]State, error) {
	f.calls++
	if command == f.fail {
		return nil, errors.New("boom")
	}
	startJD := float64(start.Unix())/86400 + 2440587.5
	n := int(stop.Sub(start)/step) + 1
	states := make([]State, n)
	for i := range states {
		jd := startJD + float64(i)*step.Hours()/24
		states[i] = State{JD: jd, X: 1000.04 + float64(i), Y: -2.06, Z: 3, VX: 0.1234564, VY: -1, VZ: 0}
	}
	return states, nil
}

func TestStepFor(t *testing.T) {
	cases := []struct {
		period float64
		want   time.Duration
	}{
		{1.769138, 318 * time.Minute},
		{27.3217, 24 * time.Hour},
		{0.3, time.Hour},
	}
	for _, c := range cases {
		if got := StepFor(c.period); got != c.want {
			t.Errorf("StepFor(%v) = %v, want %v", c.period, got, c.want)
		}
	}
}

func TestBuildSet(t *testing.T) {
	now := time.Date(2026, 10, 16, 15, 4, 5, 0, time.UTC)
	src := &fakeSource{}
	file, err := BuildSet(context.Background(), src, "moons-jupiter", now)
	if err != nil {
		t.Fatal(err)
	}
	if file.Version != 1 || file.Set != "moons-jupiter" || len(file.Bodies) != 5 || src.calls != 5 {
		t.Fatalf("unexpected file %+v (calls %d)", file, src.calls)
	}
	wantStart := float64(time.Date(2026, 9, 16, 0, 0, 0, 0, time.UTC).Unix())/86400 + 2440587.5
	if file.StartJD != wantStart {
		t.Errorf("startJd = %v, want %v", file.StartJD, wantStart)
	}
	io := file.Bodies["io"]
	if io.Center != "jupiter" || io.StepMinutes != 318 || io.Count*6 != len(io.States) || io.Count != 272 {
		t.Fatalf("bad io track: center %s step %d count %d len %d", io.Center, io.StepMinutes, io.Count, len(io.States))
	}
	if io.States[0] != 1000 || io.States[1] != -2.1 || io.States[3] != 0.123456 {
		t.Errorf("rounding wrong: %v", io.States[:6])
	}
}

func TestBuildSetErrors(t *testing.T) {
	now := time.Date(2026, 10, 16, 0, 0, 0, 0, time.UTC)
	if _, err := BuildSet(context.Background(), &fakeSource{}, "moons-vulcan", now); err == nil {
		t.Error("unknown set should fail")
	}
	if _, err := BuildSet(context.Background(), &fakeSource{fail: "503"}, "moons-jupiter", now); err == nil {
		t.Error("one failing body should fail the set")
	}
}

func TestSpacecraftRegistry(t *testing.T) {
	cmd := regexp.MustCompile(`^-?[0-9]{1,3}$`)
	center := regexp.MustCompile(`^500@[0-9]{1,3}$`)
	if len(Sets) != 8 {
		t.Fatalf("expected 8 sets, got %d", len(Sets))
	}
	counts := map[string]int{}
	for name, bodies := range Sets {
		for _, b := range bodies {
			if !cmd.MatchString(b.Command) || !center.MatchString(b.Center) || (b.Kind != "moon" && b.Kind != "spacecraft") {
				t.Errorf("%s: bad spec %+v", name, b)
			}
			counts[b.Kind]++
		}
	}
	if counts["spacecraft"] != 15 {
		t.Errorf("expected 15 spacecraft, got %d", counts["spacecraft"])
	}
}

func TestPerBodyStepAndWindow(t *testing.T) {
	now := time.Date(2026, 10, 16, 15, 0, 0, 0, time.UTC)
	file, err := BuildSet(context.Background(), &fakeSource{}, "moons-mars", now)
	if err != nil {
		t.Fatal(err)
	}
	mro := file.Bodies["mro"]
	if mro.StepMinutes != 10 || mro.Count != 2881 {
		t.Fatalf("mro step %d count %d", mro.StepMinutes, mro.Count)
	}
	wantStart := float64(time.Date(2026, 10, 6, 0, 0, 0, 0, time.UTC).Unix())/86400 + 2440587.5
	if mro.StartJD == nil || *mro.StartJD != wantStart {
		t.Fatalf("mro startJd = %v, want %v", mro.StartJD, wantStart)
	}
	if file.Bodies["phobos"].StartJD != nil {
		t.Fatal("startJd must be omitted when it equals the set start")
	}
}

type coverageSource struct {
	fakeSource
	limit time.Time
	tries map[string]int
}

func (c *coverageSource) Vectors(ctx context.Context, command, center string, start, stop time.Time, step time.Duration) ([]State, error) {
	if c.tries == nil {
		c.tries = map[string]int{}
	}
	c.tries[command]++
	if stop.After(c.limit) {
		return nil, &CoverageError{After: c.limit}
	}
	return c.fakeSource.Vectors(ctx, command, center, start, stop, step)
}

func TestCoverageIsClipped(t *testing.T) {
	now := time.Date(2026, 10, 16, 0, 0, 0, 0, time.UTC)
	src := &coverageSource{limit: time.Date(2026, 10, 20, 0, 32, 0, 0, time.UTC)}
	file, err := BuildSet(context.Background(), src, "moons-mars", now)
	if err != nil {
		t.Fatal(err)
	}
	mro := file.Bodies["mro"]
	if mro.Count != 14*144+4 || src.tries["-74"] != 2 {
		t.Fatalf("mro count %d tries %d", mro.Count, src.tries["-74"])
	}
}

func TestTransientSpacecraftFailureFailsTheSet(t *testing.T) {
	now := time.Date(2026, 10, 16, 0, 0, 0, 0, time.UTC)
	if _, err := BuildSet(context.Background(), &fakeSource{fail: "-61"}, "moons-jupiter", now); err == nil {
		t.Fatal("a non-coverage spacecraft error must fail the set so cached or static data is kept")
	}
	if _, err := BuildSet(context.Background(), &fakeSource{fail: "501"}, "moons-jupiter", now); err == nil {
		t.Fatal("a failing moon still fails the set")
	}
}

func TestRegistryIDsAreUniqueAndComplete(t *testing.T) {
	seen := map[string]string{}
	for name, bodies := range Sets {
		for _, b := range bodies {
			if prev, dup := seen[b.ID]; dup {
				t.Errorf("id %s in both %s and %s", b.ID, prev, name)
			}
			seen[b.ID] = name
			if b.ID == "" || b.CenterName == "" || (b.StepMinutes <= 0 && b.PeriodDays <= 0) {
				t.Errorf("%s: incomplete spec %+v", name, b)
			}
		}
	}
}

func TestFrontendCatalogueMatchesRegistry(t *testing.T) {
	src, err := os.ReadFile("../../../frontend/src/spacecraft/catalogue.ts")
	if err != nil {
		t.Fatal(err)
	}
	catalogue := map[string]bool{}
	for _, m := range regexp.MustCompile(`(?m)^\s+id: '([a-z0-9-]+)',$`).FindAllStringSubmatch(string(src), -1) {
		catalogue[m[1]] = true
	}
	registry := map[string]bool{}
	for _, bodies := range Sets {
		for _, b := range bodies {
			if b.Kind == "spacecraft" {
				registry[b.ID] = true
			}
		}
	}
	if len(catalogue) != len(registry) {
		t.Fatalf("catalogue has %d craft, registry %d", len(catalogue), len(registry))
	}
	for id := range registry {
		if !catalogue[id] {
			t.Errorf("registry craft %s missing from the frontend catalogue", id)
		}
	}
}

func TestCoverageTooShortSkips(t *testing.T) {
	now := time.Date(2026, 10, 16, 0, 0, 0, 0, time.UTC)
	src := &coverageSource{limit: time.Date(2026, 10, 6, 0, 5, 0, 0, time.UTC)}
	file, err := BuildSet(context.Background(), src, "moons-mars", now)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := file.Bodies["mro"]; ok {
		t.Fatal("fewer than 2 samples must skip the craft")
	}
}
