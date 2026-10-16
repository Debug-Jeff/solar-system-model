package ephem

import (
	"context"
	"errors"
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

func TestRegistryIsSafe(t *testing.T) {
	numeric := regexp.MustCompile(`^[0-9]{3}$`)
	center := regexp.MustCompile(`^500@[0-9]{3}$`)
	if len(Sets) != 7 {
		t.Fatalf("expected 7 sets, got %d", len(Sets))
	}
	for name, bodies := range Sets {
		for _, b := range bodies {
			if !numeric.MatchString(b.Command) || !center.MatchString(b.Center) || b.PeriodDays <= 0 || b.ID == "" || b.CenterName == "" {
				t.Errorf("%s: unsafe or incomplete spec %+v", name, b)
			}
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
	if file.Version != 1 || file.Set != "moons-jupiter" || len(file.Bodies) != 4 || src.calls != 4 {
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
