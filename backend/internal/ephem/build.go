package ephem

import (
	"context"
	"errors"
	"fmt"
	"log"
	"math"
	"time"
)

const (
	FormatVersion  = 1
	coverageMargin = 2 * time.Minute
	windowDays     = 30
	minStep        = time.Hour
	maxStep        = 24 * time.Hour
	stepTolerance  = 1e-6
)

type BodyTrack struct {
	Center      string    `json:"center"`
	StartJD     *float64  `json:"startJd,omitempty"`
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
	file := SetFile{
		Version:     FormatVersion,
		Set:         set,
		GeneratedAt: now.UTC().Format(time.RFC3339),
		StartJD:     float64(start.Unix())/86400 + 2440587.5,
		Bodies:      make(map[string]BodyTrack, len(bodies)),
	}
	for _, body := range bodies {
		track, err := buildTrack(ctx, src, body, day)
		var cov *CoverageError
		if err != nil {
			if body.Kind == "spacecraft" && errors.As(err, &cov) {
				log.Printf("%s/%s: skipped: %v", set, body.ID, err)
				continue
			}
			return SetFile{}, fmt.Errorf("%s/%s: %w", set, body.ID, err)
		}
		if *track.StartJD == file.StartJD {
			track.StartJD = nil
		}
		file.Bodies[body.ID] = track
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

func jdOf(t time.Time) float64 {
	return float64(t.Unix())/86400 + 2440587.5
}

func buildTrack(ctx context.Context, src VectorSource, body BodySpec, day time.Time) (BodyTrack, error) {
	step := StepFor(body.PeriodDays)
	if body.StepMinutes > 0 {
		step = time.Duration(body.StepMinutes) * time.Minute
	}
	window := windowDays
	if body.WindowDays > 0 {
		window = body.WindowDays
	}
	start := day.AddDate(0, 0, -window)
	stop := day.AddDate(0, 0, window)
	states, err := src.Vectors(ctx, body.Command, body.Center, start, stop, step)
	var cov *CoverageError
	if errors.As(err, &cov) {
		if !cov.After.IsZero() {
			stop = start.Add(cov.After.Add(-coverageMargin).Sub(start).Truncate(step))
		}
		if !cov.Before.IsZero() {
			gap := cov.Before.Add(coverageMargin).Sub(start)
			start = start.Add(((gap + step - 1) / step) * step)
		}
		if stop.Sub(start) < step {
			return BodyTrack{}, fmt.Errorf("coverage too short: %w", cov)
		}
		states, err = src.Vectors(ctx, body.Command, body.Center, start, stop, step)
	}
	if err != nil {
		return BodyTrack{}, err
	}
	startJD := jdOf(start)
	if err := checkSpacing(states, startJD, step); err != nil {
		return BodyTrack{}, err
	}
	flat := make([]float64, 0, len(states)*6)
	for _, s := range states {
		flat = append(flat, round(s.X, 10), round(s.Y, 10), round(s.Z, 10), round(s.VX, 1e6), round(s.VY, 1e6), round(s.VZ, 1e6))
	}
	return BodyTrack{Center: body.CenterName, StartJD: &startJD, StepMinutes: int(step / time.Minute), Count: len(states), States: flat}, nil
}
