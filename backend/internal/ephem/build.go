package ephem

import (
	"context"
	"fmt"
	"math"
	"time"
)

const (
	FormatVersion = 1
	windowDays    = 30
	minStep       = time.Hour
	maxStep       = 24 * time.Hour
	stepTolerance = 1e-6
)

type BodyTrack struct {
	Center      string    `json:"center"`
	StepMinutes int       `json:"stepMinutes"`
	Count       int       `json:"count"`
	States      []float64 `json:"states"`
}

type SetFile struct {
	Version     int                  `json:"version"`
	Set         string               `json:"set"`
	GeneratedAt string               `json:"generatedAt"`
	StartJD     float64              `json:"startJd"`
	Bodies      map[string]BodyTrack `json:"bodies"`
}

func StepFor(periodDays float64) time.Duration {
	step := time.Duration(periodDays / 8 * float64(24*time.Hour)).Truncate(time.Minute)
	return min(max(step, minStep), maxStep)
}

func round(v, scale float64) float64 {
	return math.Round(v*scale) / scale
}

func BuildSet(ctx context.Context, src VectorSource, set string, now time.Time) (SetFile, error) {
	bodies, ok := Sets[set]
	if !ok {
		return SetFile{}, fmt.Errorf("unknown ephemeris set %q", set)
	}
	day := now.UTC().Truncate(24 * time.Hour)
	start := day.AddDate(0, 0, -windowDays)
	stop := day.AddDate(0, 0, windowDays)
	file := SetFile{
		Version:     FormatVersion,
		Set:         set,
		GeneratedAt: now.UTC().Format(time.RFC3339),
		StartJD:     float64(start.Unix())/86400 + 2440587.5,
		Bodies:      make(map[string]BodyTrack, len(bodies)),
	}
	for _, body := range bodies {
		step := StepFor(body.PeriodDays)
		states, err := src.Vectors(ctx, body.Command, body.Center, start, stop, step)
		if err != nil {
			return SetFile{}, fmt.Errorf("%s/%s: %w", set, body.ID, err)
		}
		if err := checkSpacing(states, file.StartJD, step); err != nil {
			return SetFile{}, fmt.Errorf("%s/%s: %w", set, body.ID, err)
		}
		flat := make([]float64, 0, len(states)*6)
		for _, s := range states {
			flat = append(flat, round(s.X, 10), round(s.Y, 10), round(s.Z, 10), round(s.VX, 1e6), round(s.VY, 1e6), round(s.VZ, 1e6))
		}
		file.Bodies[body.ID] = BodyTrack{Center: body.CenterName, StepMinutes: int(step / time.Minute), Count: len(states), States: flat}
	}
	return file, nil
}

func checkSpacing(states []State, startJD float64, step time.Duration) error {
	if len(states) < 2 {
		return fmt.Errorf("only %d samples", len(states))
	}
	stepDays := step.Hours() / 24
	for i, s := range states {
		if math.Abs(s.JD-(startJD+float64(i)*stepDays)) > stepTolerance {
			return fmt.Errorf("sample %d at JD %.6f is off the %v grid", i, s.JD, step)
		}
	}
	return nil
}
