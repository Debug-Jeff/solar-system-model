# Backend Ephemeris Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sampled JPL Horizons state vectors for the major moons, fetched sequentially and cached. They are served by `GET /api/ephem/{set}`, written as static snapshot files by a Go command, refreshed daily by a GitHub Action, and loaded in the frontend by a static-first loader with Hermite interpolation. There is no visible change yet; branch 5 wires the moons to this data.

**Architecture:**
- Go package `internal/ephem` holds the set registry (an allowlist), the Horizons client and the set builder.
- Two consumers share it:
  - the HTTP handler, which uses the existing disk cache, singleflight and failure-cache patterns
  - `cmd/snapshot`, which writes `frontend/public/data/ephem/<set>.json` and refreshes `frontend/src/ephemeris/data/smallBodyElements.json` from SBDB
- Frontend: `ephemeris/sampled.ts` validates the files and does Hermite interpolation. `ephemeris/loader.ts` fetches the static snapshot first, then tries the backend and keeps whichever is newer.

**Tech Stack:** Go 1.26 stdlib with `x/sync` and `x/time`, GitHub Actions, TypeScript and Vitest.

**Spec:** `docs/superpowers/specs/2026-10-16-eyes-redesign-design.md`. This plan is branch 4 of 12. It covers the "Backend", "Data snapshots" and "Answered by Jeff: daily GitHub Action" sections.

## Global Constraints

- Branch `feat/backend-ephemeris` from `main`. Jeff has authorized merging to `main` after review and green CI.
- Conventions: no code comments (Go or TS), conventional commits, no attribution, gofmt, strict TS, no HTML sinks, and `httptest` fakes for upstream calls.
- **Security:**
  - Horizons `COMMAND` and `CENTER` values come **only** from the registry. The `{set}` path value is matched against the registry and anything else gets a 404.
  - Upstream responses are capped at 8 MiB.
  - The upstream budget is shared with the existing NASA limiter pattern.
  - Errors are logged without query strings.
- **Horizons etiquette:** strictly sequential requests at least 300 ms apart, from a single goroutine per build.
- **Sets:**
  - `moons-earth`: moon 301
  - `moons-mars`: phobos 401, deimos 402
  - `moons-jupiter`: io 501, europa 502, ganymede 503, callisto 504
  - `moons-saturn`: mimas 601, enceladus 602, tethys 603, dione 604, rhea 605, titan 606, iapetus 608
  - `moons-uranus`: ariel 701, umbriel 702, titania 703, oberon 704, miranda 705
  - `moons-neptune`: triton 801
  - Each body is centred on its planet (`500@399`, `500@499`, `500@599`, `500@699`, `500@799`, `500@899`).
- **Sampling:**
  - Window from now − 30 d to now + 30 d (UTC midnight-aligned).
  - Step = `clamp(periodDays / 8, 1h, 1d)`, rounded down to whole minutes.
  - `REF_PLANE=ECLIPTIC REF_SYSTEM=ICRF OUT_UNITS=KM-S VEC_TABLE=2 CSV_FORMAT=YES TIME_TYPE=UT`.
- **Wire format** (version 1):

```json
{ "version": 1, "set": "moons-jupiter", "generatedAt": "2026-10-16T00:00:00Z",
  "startJd": 2461299.5, "bodies": { "io": { "center": "jupiter", "stepMinutes": 318, "count": 543,
  "states": [x,y,z,vx,vy,vz, ...] } } }
```

  Positions are in km, rounded to 0.1 km. Velocities are in km/s, rounded to 1e-6.
- **Static path:** `/data/ephem/<set>.json`. **API path:** `/api/ephem/<set>`. Cache-Control is `public, max-age=21600`.
- **Snapshot Action** (`.github/workflows/snapshot.yml`):
  - Triggers: `schedule: '17 3 * * *'` and `workflow_dispatch` only.
  - `permissions: contents: write`.
  - Actions are pinned to full commit SHAs.
  - Runs `go run ./cmd/snapshot` from `backend`, and commits only when files changed, as `github-actions[bot]`, with the message `chore(data): refresh ephemeris snapshot`.
  - No secrets are needed in this branch: Horizons and SBDB are keyless.
- **Deferred minor from branch 2:** invalid SBDB elements must drop that body (with `console.error`) instead of throwing on import.

## Review Focus

1. **Horizons returns 200 with an `error` field, an empty `$$SOE` block, or an HTML maintenance page.** The build fails for that set, the handler serves the last good cache or a 502, and the snapshot command exits non-zero without overwriting good files. Covered in Task 1 (client tests), Task 3 and Task 4.
2. **The path is `/api/ephem/../../etc` or `/api/ephem/moons-jupiter%00`, or uses an unknown set.** The response is a 404 with no upstream call. Covered in Task 3.
3. **Twenty concurrent requests for the same cold set** cause exactly one Horizons build, via singleflight. Covered in Task 3.
4. **The static file is malformed or truncated, or `count` disagrees with `states.length`.** The loader rejects it and falls back to the backend; if that fails too it returns `null`, and branch 5 then uses placeholders. Covered in Task 6.
5. **A time outside the sample window, or an exact sample boundary.** Interpolation returns `null` outside the window and the exact sample inside it. Covered in Task 5.

---

### Task 1: Horizons client

**Files:** `backend/internal/ephem/horizons.go`, `horizons_test.go`

**Produces:**
- `type State struct{ JD, X, Y, Z, VX, VY, VZ float64 }`
- `type Horizons struct{ Base string; http *http.Client; minGap time.Duration; last time.Time; mu sync.Mutex }`
- `func NewHorizons() *Horizons` (Base `https://ssd.jpl.nasa.gov`, timeout 30 s, minGap 300 ms)
- `func (h *Horizons) Vectors(ctx context.Context, command, center string, start, stop time.Time, step time.Duration) ([]State, error)`, which builds the URL with `url.Values`, waits out `minGap` under the mutex, caps the body at 8 MiB, decodes the JSON, rejects a non-empty `error` field, and parses the CSV rows between `$$SOE` and `$$EOE`.

- [ ] **Step 1: Failing tests** with an `httptest` server:
  - It parses 3 CSV rows into States with the right numbers.
  - The query contains `COMMAND='501'`, `CENTER='500@599'`, `STEP_SIZE='318m'`, `OUT_UNITS=KM-S` and `VEC_TABLE=2`.
  - An `error` field gives an error.
  - A missing `$$SOE` gives an error.
  - A non-JSON body gives an error.
  - A 503 gives an error.
  - Two calls are at least `minGap` apart: set it to 50 ms in the test and measure.
  - The error string never contains `?`.
- [ ] **Step 2: FAIL.** **Step 3: Implement.** **Step 4: PASS** (`go test ./internal/ephem/...`).
- [ ] **Step 5: Commit** `feat(backend): sequential JPL Horizons vectors client`

### Task 2: Set registry and builder

**Files:** `backend/internal/ephem/sets.go`, `build.go`, tests

**Produces:**
- `type BodySpec struct{ ID, Command, Center, CenterName string; PeriodDays float64 }`
- `var Sets map[string][]BodySpec` (the list above, with periods in days)
- `func StepFor(periodDays float64) time.Duration`
- `type BodyTrack struct{ Center string; StepMinutes int; Count int; States []float64 }`
- `type SetFile struct{ Version int; Set string; GeneratedAt string; StartJD float64; Bodies map[string]BodyTrack }` with the JSON tags from the wire format
- `func BuildSet(ctx context.Context, h VectorSource, set string, now time.Time) (SetFile, error)`, where `VectorSource` is an interface with `Vectors(...)`. It returns an error on an unknown set or on any body failure; partial sets are never returned. It rounds as specified.

- [ ] **Step 1: Failing tests:**
  - `StepFor(1.769)` = 318 min (Io), `StepFor(27.32)` = 1 d (capped), and `StepFor(0.3)` = 1 h (floored).
  - Every registry command is numeric and every centre matches `^500@[0-9]{3}$`.
  - `BuildSet` with a fake source returns every body with `Count*6 == len(States)` and the window start at midnight of now − 30 d.
  - An unknown set errors.
  - One failing body fails the whole set.
- [ ] **Step 2: FAIL.** **Step 3: Implement.** **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(backend): moon ephemeris set registry and builder`

### Task 3: `/api/ephem/{set}` handler

**Files:**
- Modify `backend/internal/handlers/handlers.go`, adding `Ephem` and the `Horizons ephem.VectorSource` field on `Deps`.
- Modify `main.go`, adding the route `GET /api/ephem/{set}`.
- Test: `handlers_test.go`.

Behaviour:
- Validate `r.PathValue("set")` against `ephem.Sets`, otherwise 404.
- The disk cache key is `ephem/<set>-<YYYY-MM-DD>.json` (UTC).
- Use singleflight on the key and the existing failure cache.
- On build error, serve yesterday's cached file if it exists, otherwise 502.
- Responses are `application/json` with Cache-Control `public, max-age=21600`.

- [ ] **Step 1: Failing tests:**
  - An unknown set → 404 and 0 builds.
  - A traversal-looking path → 404, or 400 from the mux, with 0 builds.
  - A valid set → 200 with JSON whose `set` matches.
  - A second request is served from cache, still 1 build.
  - 20 concurrent cold requests → exactly 1 build.
  - A build error with yesterday cached → 200 with yesterday's file. With nothing cached → 502.
- [ ] **Step 2: FAIL.** **Step 3: Implement.** **Step 4: PASS**, plus `go vet ./...` and `gofmt -l .` empty.
- [ ] **Step 5: Commit** `feat(backend): serve cached moon ephemeris sets`

### Task 4: Snapshot command

**Files:** `backend/cmd/snapshot/main.go`, `main_test.go`

Behaviour:
- `go run ./cmd/snapshot [-out ../frontend/public/data/ephem] [-elements ../frontend/src/ephemeris/data/smallBodyElements.json]`.
- Builds every set and writes each to a temp file and then renames it, so writes are atomic.
- Fetches SBDB full-precision elements for `1`, `1P` and `2P` (port of `fetch-ephemeris-data.mjs`'s SBDB half) and writes the elements file in the same shape.
- If **any** set or element fails, it exits 1 without touching existing files. All sets are built first, then everything is written.

- [ ] **Step 1: Failing tests** (fake VectorSource and a fake SBDB `httptest` server):
  - A run writes 6 set files and the elements file.
  - A failing set leaves pre-existing files byte-identical and returns an error.
  - SBDB elements with `e >= 1` are rejected.
- [ ] **Step 2: FAIL.** **Step 3: Implement.** **Step 4: PASS.**
- [ ] **Step 5: Run it for real once** (`cd backend && go run ./cmd/snapshot`) and commit the generated files. Expected: 6 files, each under 200 KB.
- [ ] **Step 6: Commit** `feat(backend): snapshot command for static ephemeris data` and then `chore(data): initial ephemeris snapshot`

### Task 5: Frontend sampled tracks

**Files:** `frontend/src/ephemeris/sampled.ts`, `sampled.test.ts`

**Produces:**
- `interface SampledTrack { center: string; startMs: number; stepMs: number; count: number; states: Float64Array }`
- `type EphemSet = { set: string; generatedAtMs: number; bodies: Record<string, SampledTrack> }`
- `parseEphemSet(raw: unknown, expectedSet: string): EphemSet`, which throws on a version ≠ 1, a set mismatch, `count*6 !== states.length`, non-finite values, `count > 5000`, or a non-positive step
- `sampledPosition(track: SampledTrack, utcMs: number): Vec3 | null`. It does cubic Hermite interpolation using velocities scaled by the step in seconds, returns exact samples at nodes, returns `null` outside `[start, start + (count−1)·step]`, and returns km relative to the centre in the J2000 ecliptic.

- [ ] **Step 1: Failing tests:**
  - A synthetic circular orbit (r = 1000 km, period 1 d) sampled every 3 h with exact velocities. The interpolated position at mid-step is within 0.5 km of the analytic value.
  - At a node it is exact.
  - Before the start and after the end it is `null`.
  - `parseEphemSet` rejects a bad version, a wrong set, a count mismatch, NaN, and a negative step.
- [ ] **Step 2: FAIL.** **Step 3: Implement.** **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(ephemeris): validated sampled tracks with Hermite interpolation`

### Task 6: Loader and SBDB drop-and-log

**Files:**
- `frontend/src/ephemeris/loader.ts` and `loader.test.ts`
- Modify `frontend/src/ephemeris/index.ts` and `ephemeris.test.ts`

**Produces:**
- `loadEphemSet(set: string, deps?: { fetch?: typeof fetch; apiBase?: string }): Promise<EphemSet | null>`. It fetches `/data/ephem/${set}.json` first, then `${apiBase}/api/ephem/${set}`, parses both, and returns the one with the newest `generatedAtMs`, or the single one that parsed, or `null`. It never throws, and it logs failures with `console.warn`.
- In `index.ts`, bodies whose elements fail validation are excluded: `hasEphemeris` returns false and `console.error` is called once. This replaces the throw.

- [ ] **Step 1: Failing tests:**
  - Static OK and backend down → the static set.
  - Backend newer → the backend set.
  - Static malformed and backend OK → the backend set.
  - Both bad → `null`.
  - An elements loader given `{ ceres: { ...e: 1.2 } }` → `hasEphemeris('ceres')` is false and there is no throw. Expose `loadElements(raw)` for the test.
- [ ] **Step 2: FAIL.** **Step 3: Implement.** **Step 4: PASS**, plus the full frontend suite, typecheck and build.
- [ ] **Step 5: Commit** `feat(ephemeris): static-first set loader; drop invalid small-body elements`

### Task 7: Daily snapshot Action, docs, push, review, merge

- [ ] Write `.github/workflows/snapshot.yml` per the Global Constraints. Resolve the pinned SHAs with `gh api repos/actions/checkout/commits/v5` and `actions/setup-go` v6.
- [ ] Mention `/api/ephem/{set}` and the daily snapshot in one README line.
- [ ] Run the backend tests, vet and gofmt, and the frontend suite.
- [ ] gitleaks, push, PR, whole-branch review, fix pass, green CI, fast-forward merge to `main`, delete the branch.
- [ ] After the merge, trigger the Action once with `gh workflow run snapshot.yml` and confirm it succeeds. It must either commit nothing (data unchanged that day) or commit one data commit.
