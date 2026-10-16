# Time and Ephemeris Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The clock starts at the real current time, runs at real rate by default, and shows a LIVE badge. Every planet, Pluto, Ceres, Halley and Encke is drawn at its true heliocentric direction for the displayed time.

**Architecture:**
- A pure `src/ephemeris/` module turns `(bodyId, utcMs)` into a heliocentric J2000 ecliptic position in AU. It has no Three.js import.
  - Planets and Pluto come from **Astronomy Engine** (VSOP87-class, MIT). It returns J2000 equatorial (EQJ) positions, which are rotated to ecliptic.
  - Ceres, Halley and Encke come from embedded JPL SBDB osculating elements, propagated with two-body Kepler.
- The engine maps ecliptic AU to scene units in `engine/frames.ts`. Distance is still radially compressed with `orbitVisualDistance`, since true scale is branch 3, but the **direction is real**.
- Positions are computed from the absolute sim time every frame, so nothing drifts by accumulating per-frame steps.
- The store replaces the speed multiplier with a **rate** in sim-seconds per real second, plus a LIVE state.

**Tech Stack:** astronomy-engine 2.1.19, TypeScript, Vitest, React, Three.js.

**Spec:** `docs/superpowers/specs/2026-10-16-eyes-redesign-design.md`. This plan is branch 2 of 12.

## Global Constraints

- Branch `feat/time-and-ephemeris-core`, cut from `main`. The PR targets `main`. Pushing the feature branch is pre-authorized; merging is Jeff's call.
- No code comments. Conventional commits. No AI attribution. npm. Strict TS with no `any`. No raw HTML sinks (CI enforces this).
- **Frame:** J2000 ecliptic, heliocentric, AU, in the ephemeris layer. Scene mapping is `scene.x = ecl.x`, `scene.y = ecl.z`, `scene.z = -ecl.y`, which keeps the right-handed frame with ecliptic north = +Y.
- **Time:** UTC milliseconds throughout. Astronomy Engine applies ΔT itself. For SBDB propagation the TT−UTC difference (~69 s) is ignored, which is below the accuracy targets.
- **Accuracy (spec):**
  - Planets and Pluto: within 0.1° of heliocentric longitude versus Horizons over 1900–2050.
  - Ceres: within 1° within ±50 years of its element epoch.
  - Comets: no spec target. Report them as `approximate` and test within 1° at ±1 year of epoch only.
- **Date range** 1900-01-01 – 2050-12-31. Running past either end clamps the time there and pauses.
- **LIVE** means: rate = 1 and |simTime − now| < 2000 ms.
- **Rate steps** (sim-s per real-s): `[1, 60, 3600, 86400, 604800, 2629800, 31557600]`, labelled `real rate`, `1 min/s`, `1 hr/s`, `1 day/s`, `1 wk/s`, `1 mo/s`, `1 yr/s`. Negative rates show a leading `−`.
- **Moons** keep their current placeholder motion, made absolute-time, and report `approximate` until branch 5.
- Credit Astronomy Engine (MIT) in a new `CREDITS.md`.

## Review Focus

1. **Time runs past 2050-12-31 at 1 yr/s, or before 1900 in reverse.** It clamps to the bound, pauses, and never produces NaN or invalid positions. Covered in Task 3, `store.test.ts`.
2. **The tab is backgrounded for minutes.** `THREE.Timer` with `connect(document)` already zeroes delta on hidden tabs. On return in LIVE mode the clock must re-sync to now, not resume from the old value. Covered in Task 3 (`resyncIfLive`) and Task 4 (wiring).
3. **A body with no ephemeris** (a moon, or an unknown id from `/api/planets`) must not crash. It falls back to the placeholder orbit and is flagged `approximate`. Covered in Task 2, `ephemeris.test.ts`.
4. **Hyperbolic or near-parabolic elements** (e ≥ 1) from data must be rejected, not looped forever in the Kepler solver. Covered in Task 2.
5. **A user in a non-UTC timezone** sees local time, labelled with their zone, and the date jump still interprets `YYYY-MM-DD` as UTC midnight, consistent with the existing store. Covered in Task 5, `TimeBar.test.tsx`.

---

## File Structure

```
frontend/
  scripts/fetch-ephemeris-data.mjs        one-off: SBDB elements + Horizons reference vectors → JSON (re-runnable)
  src/ephemeris/
    data/smallBodyElements.json           SBDB full-precision elements for ceres, halley, encke
    fixtures/horizons.json                Horizons heliocentric ecliptic vectors (test-only)
    types.ts                              Vec3, EphemerisId, Availability
    planets.ts                            planetPosition(id, ms) via astronomy-engine
    kepler.ts                             elementsPosition(el, ms), validateElements
    index.ts                              heliocentricEcliptic, orbitPath, availability, hasEphemeris
    ephemeris.test.ts
  src/engine/frames.ts                    eclipticToScene, compressRadial
  src/engine/frames.test.ts
  src/state/store.ts                      rate model, LIVE, clamping
  src/hud/TimeBar.tsx                     replaces TimeControls
  src/hud/rate.ts                         formatRate
CREDITS.md
```

---

### Task 1: Reference data script and committed data

**Files:** Create `frontend/scripts/fetch-ephemeris-data.mjs`, `frontend/src/ephemeris/data/smallBodyElements.json`, `frontend/src/ephemeris/fixtures/horizons.json`.

- [ ] **Step 1: Branch.** `git switch main && git pull --ff-only && git switch -c feat/time-and-ephemeris-core && cd frontend && npm i astronomy-engine@2.1.19`
- [ ] **Step 2: Write the script.** Node, no dependencies. Requests are **sequential**, with 300 ms between them, as Horizons asks.
  - **SBDB:** `https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=<s>&full-prec=1` for `1` → `ceres`, `1P` → `halley`, `2P` → `encke`. Write `{ id: { epochJd, a, e, i, om, w, ma, n } }`, with angles in degrees and `n` in deg/day, parsed as numbers.
  - **Horizons:** for `mercury 199`, `venus 299`, `earth 399`, `mars 499`, `jupiter 599`, `saturn 699`, `uranus 799`, `neptune 899`, `pluto 999`, `ceres 'DES=1;'`, `halley 'DES=1P;CAP'` and `encke 'DES=2P;CAP'`, request `EPHEM_TYPE=VECTORS CENTER='500@10' REF_PLANE=ECLIPTIC REF_SYSTEM=ICRF OUT_UNITS=AU-D VEC_TABLE=1 CSV_FORMAT=YES TIME_TYPE=UT` with `TLIST`. Use these UTC dates:
    - planets: 1900-01-01, 1950-06-15, 2000-01-01, 2026-10-16, 2050-12-31
    - ceres: its epoch −50 y, epoch, epoch +24 y (capped at 2050)
    - comets: their epochs ±1 y
  - Write `{ id: [{ jd, x, y, z }] }`.
  - Abort with a non-zero exit on any non-200 response, on an `error` field, or on a body that has no `$$SOE` block.
- [ ] **Step 3: Run it and check the output.** `node scripts/fetch-ephemeris-data.mjs`. Expected: both JSON files are written, each planet has 5 rows, and `jq '.ceres.a'` is about 2.77.
- [ ] **Step 4: Commit** `chore(ephemeris): fetch SBDB elements and Horizons reference vectors`

---

### Task 2: Ephemeris module

**Interfaces (Produces):**

```ts
export type Vec3 = { x: number; y: number; z: number }
export type Availability = 'exact' | 'approximate'
export type EphemerisId = 'mercury'|'venus'|'earth'|'mars'|'jupiter'|'saturn'|'uranus'|'neptune'|'pluto'|'ceres'|'halley'|'encke'
export interface OrbitalElements { epochJd: number; a: number; e: number; i: number; om: number; w: number; ma: number; n: number }
export function hasEphemeris(id: string): id is EphemerisId
export function heliocentricEcliptic(id: EphemerisId, utcMs: number): Vec3
export function orbitPath(id: EphemerisId, utcMs: number, segments?: number): Vec3[]
export function availability(id: string, utcMs: number): Availability
export function validateElements(el: OrbitalElements): void
export function elementsPosition(el: OrbitalElements, utcMs: number): Vec3
export const UNIX_EPOCH_JD = 2440587.5
```

Notes:
- `orbitPath` samples `segments + 1` points (default 360) across one orbital period centered on `utcMs`, giving a closed loop. Planets use the sidereal period of each body. Kepler bodies use `360 / n` days.
- `availability`:
  - `exact` for planets and Pluto inside the date range.
  - Ceres: `exact` within ±50 years of its epoch, otherwise `approximate`.
  - Comets, moons and unknown ids: always `approximate`.
- `validateElements` throws if `e < 0`, `e >= 1`, `a <= 0`, or any field is not finite.

- [ ] **Step 1: Write the failing tests** in `ephemeris.test.ts`. Write a helper `lonDeg(v) = atan2(y, x)` in degrees and an angular difference that is wrapped.

```ts
test.each(planetRows)('%s at JD %d within 0.1° of Horizons', (id, row) => expect(angleDiff(lonDeg(heliocentricEcliptic(id, jdToMs(row.jd))), lonDeg(row))).toBeLessThan(0.1))
test.each(planetRows)('%s distance within 0.5% of Horizons', ...)
test.each(ceresRows)('ceres within 1° of Horizons', ...)
test.each(cometRows)('%s within 1° of Horizons at epoch ±1y', ...)
test('orbitPath closes', () => { const p = orbitPath('mars', now); expect(p).toHaveLength(361); expect(dist(p[0], p[360])).toBeLessThan(1e-3) })
test('availability', () => { expect(availability('mars', now)).toBe('exact'); expect(availability('halley', now)).toBe('approximate'); expect(availability('io', now)).toBe('approximate'); expect(availability('ceres', jdToMs(ceresEpoch + 365.25 * 60))).toBe('approximate') })
test.each([{ e: 1 }, { e: 1.2 }, { a: 0 }, { i: NaN }])('validateElements rejects %o', (patch) => expect(() => validateElements({ ...ceres, ...patch })).toThrow())
test('hasEphemeris', () => { expect(hasEphemeris('mars')).toBe(true); expect(hasEphemeris('io')).toBe(false) })
```

- [ ] **Step 2: Run and confirm FAIL** (module missing).
- [ ] **Step 3: Implement.**
  - `planets.ts`: `HelioVector(Body.X, MakeTime(new Date(ms)))`, then `RotateVector(Rotation_EQJ_ECL(), v)`.
  - `kepler.ts`: standard perifocal-to-ecliptic rotation using `om`, `i` and `w`. Reuse `eccentricAnomaly` from `engine/orbit.ts` by moving it into `ephemeris/kepler.ts` and re-exporting it from `engine/orbit.ts` so existing imports keep working.
  - `index.ts`: load the JSON and call `validateElements` on import.
- [ ] **Step 4: Run and confirm PASS.** If any row misses its threshold, stop and debug. **Never loosen a threshold without a ledgered ruling that cites the spec.**
- [ ] **Step 5: Commit** `feat(ephemeris): real heliocentric positions for planets, Pluto, Ceres and comets`

---

### Task 3: Store time model

**Interfaces (Produces, in `state/store.ts`):**
- Replace `speed` / `lastNonzeroSpeed` / `BASE_SIM_HOURS_PER_SECOND` / `SIM_START_MS` with:
  - `rate: number`
  - `paused: boolean`
  - `RATE_STEPS: readonly number[]`
  - `MIN_SIM_MS = Date.UTC(1900,0,1)`, `MAX_SIM_MS = Date.UTC(2050,11,31,23,59,59)`
- `createAppStore(nowMs: () => number = Date.now)`
- Actions:
  - `advance(realSeconds)` adds `realSeconds * rate * 1000` when not paused, then clamps. At a bound it sets `paused = true`.
  - `togglePlay()`
  - `faster()` / `slower()` step the magnitude through `RATE_STEPS`, keep the sign, and clamp at both ends.
  - `reverse()` negates the rate.
  - `goLive()` sets `simTimeMs = now()`, `rate = 1`, `paused = false`.
  - `resyncIfLive(wasLive: boolean)`: when `wasLive`, sets `simTimeMs = now()`.
- `isLive(state, nowMs): boolean` (exported pure function).
- `simJumpSeq` is removed, because positions are absolute.
- `jumpToDate` keeps its validation, sets `simTimeMs`, and leaves rate as it is.

- [ ] **Step 1: Rewrite the time tests in `store.test.ts`.** Use an injected clock `let now = Date.UTC(2026,9,16,12)`.
  - The store starts at `now()` with rate 1 and is LIVE.
  - `advance(2)` at rate 3600 adds 2 h.
  - `faster()` from 1 → 60. From the max it stays at 31557600. `slower()` from 1 stays at 1.
  - `reverse()` gives −1, and then `faster()` gives −60.
  - Paused, `advance` changes nothing and `isLive` is false.
  - At rate 31557600 starting from 2050-12-01, `advance(10)` clamps to `MAX_SIM_MS` and sets `paused`. Same in reverse at the minimum.
  - `goLive()` after a jump restores now, rate 1 and LIVE.
  - `isLive` is false when the time is off by 3 s, and true when off by 1 s.
  - `resyncIfLive(true)` jumps to the new `now`. `resyncIfLive(false)` keeps the old time.
  - Keep the existing jumpToDate, select, follow, resetView and setLayer tests, minus `simJumpSeq`.
- [ ] **Step 2: Run and confirm FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run and confirm PASS, plus typecheck.** Expected: type errors in the engine and HUD that still use `speed`. Fix them in Tasks 4–5, and make sure this commit typechecks by stubbing only the call sites, e.g. `speed` → `rate`.
- [ ] **Step 5: Commit** `feat(time): real-time clock with rate steps, LIVE state and range clamping`

---

### Task 4: Engine on real positions

**Interfaces:**
- `engine/frames.ts`:
  - `eclipticToScene(v: Vec3, out: THREE.Vector3): THREE.Vector3`
  - `compressRadial(v: Vec3, distanceFn: (au: number) => number): Vec3` keeps the direction and sets `|result| = distanceFn(|v|)`. It returns the origin for `|v| = 0`.
- `bodies.ts`:
  - `updateFrame(simTimeMs: number, deltaSimHours: number)` replaces both the old `updateFrame` and `snapToTime`.
  - Ephemeris bodies: `pivot.position = eclipticToScene(compressRadial(heliocentricEcliptic(id, ms), orbitVisualDistance))`, placed directly in the scene, with no `orbitFrame` rotation.
  - The orbit line is `orbitPath(id, ms)` mapped the same way. It is built once at startup and rebuilt only after a date jump of more than one orbital period.
  - Non-ephemeris primaries and moons: the existing placeholder, but with `theta = initialTheta + angularSpeedPerSimHour * hoursSince(J2000)`, so it is absolute.
- `engine.ts`:
  - Each frame: `advance(delta)`, then `bodies.updateFrame(state.simTimeMs, delta * state.rate / 3600)` (0 when paused). Belts use the same delta.
  - On `visibilitychange` to visible: `store.getState().resyncIfLive(wasLiveWhenHidden)`.

- [ ] **Step 1: Write failing tests in `frames.test.ts`.**
  - `eclipticToScene({x:1,y:2,z:3})` → `(1, 3, -2)`.
  - `compressRadial({x:3,y:4,z:0}, d => 2 * d)` → length 10, same direction.
  - `compressRadial` of the origin → the origin.
  - Earth's scene position at the vernal equinox 2026-03-20 14:46 UTC points roughly along scene −X: the Sun is at ecliptic longitude 0° as seen from Earth, so Earth's heliocentric longitude is about 180°. The angle to (−1, 0, 0) is under 1°.
- [ ] **Step 2: Run and confirm FAIL.**
- [ ] **Step 3: Implement** frames, the bodies changes and the engine wiring. Remove `enforcePlanetOrbitSpacing`, `cometVisualOrbit` and the golden-angle `orbitFrame` for ephemeris bodies.
- [ ] **Step 4: Run the full suite and typecheck, then check in the browser.**
  - Planets sit in different places than before. At LIVE the date matches today, and nothing moves visibly at real rate.
  - At `1 day/s` Mercury visibly orbits.
  - Jumping to `2061-…` is rejected, and jumping to `2050-01-01` moves everything.
  - Halley's dashed orbit appears on selection.
  - **Cross-check one sight:** on 2026-10-16, Saturn's heliocentric longitude should be about 11.3° (spike value).
- [ ] **Step 5: Commit** `feat(engine): place planets, Pluto, Ceres and comets at real positions`

---

### Task 5: TimeBar HUD and position flag

**Interfaces:**
- `hud/rate.ts`: `formatRate(rate: number, paused: boolean): string`. Returns `'PAUSED'` when paused, the step label for exact steps, `−` plus the label for negatives, and otherwise `${Math.round(rate)}×`.
- `hud/TimeBar.tsx` replaces `TimeControls.tsx`. Contents:
  - LIVE button (`aria-label="Go live"`, class `live` when live), which calls `goLive`.
  - Date `formatSimDate(ms)` and local time `HH:MM:SS` with a zone label from `Intl.DateTimeFormat().resolvedOptions().timeZone`.
  - Buttons: slower (`aria-label="Slower"`), play/pause (`title="Play/Pause"`), faster (`aria-label="Faster"`), reverse (`aria-label="Reverse"`), plus the rate label.
  - Reset View and Jump to Date.
  - It re-renders at most when the displayed second changes: the selector returns `Math.floor(ms / 1000)` together with `rate` and `paused`.
- The `#sim-date` pill is removed from `TopBar`, because the date now lives in the TimeBar. This fixes the mobile overlap.
- `InfoPanel` adds a `Position` row reading `Live` or `Approximate`, from `availability(body.id, simTimeMs)`.

- [ ] **Step 1: Write failing tests.**
  - `rate.test.ts`: `formatRate(1,false)` = `'real rate'`, `(86400,false)` = `'1 day/s'`, `(-3600,false)` = `'−1 hr/s'`, `(60,true)` = `'PAUSED'`.
  - `TimeBar.test.tsx`, with an injected-clock store:
    - LIVE has class `live` initially.
    - After clicking Faster, the rate label is `1 min/s` and LIVE lacks `live`.
    - Clicking LIVE restores `real rate`.
    - The time text matches `/\d{2}:\d{2}:\d{2}/` and contains the zone label.
  - `InfoPanel.test.tsx`: selecting `halley` shows `Approximate`, and selecting `mars` shows `Live`.
- [ ] **Step 2: Run and confirm FAIL.**
- [ ] **Step 3: Implement.** Delete `TimeControls.tsx` and its test, and move the date-modal tests to `TimeBar.test.tsx`. Add CSS for `.live` (green dot, `#4ade80`) and the button row, reusing the existing pill and icon classes.
- [ ] **Step 4: Full verification.** `npm run typecheck && npm test && npm run build`, the HTML-sink grep, and a browser check on desktop and at 390×844: LIVE is green on load, the clock ticks every second, Faster/Slower/Reverse/Pause work, and the date pill no longer overlaps.
- [ ] **Step 5: Commit** `feat(hud): time bar with LIVE badge, rate steps and position accuracy flag`

---

### Task 6: Credits, push, PR

- [ ] **Step 1:** Create `CREDITS.md` with sections Libraries (Three.js MIT, React MIT, Zustand MIT, Astronomy Engine MIT by Don Cross), Data (NASA/JPL Horizons, JPL SBDB, NASA APOD, EPIC, GIBS) and Textures (*source not recorded; to be resolved in feat/textures-and-quality*). Link it from the README.
- [ ] **Step 2:** `cd frontend && npm run typecheck && npm test && npm run build`. Expected: green.
- [ ] **Step 3: Commit** `docs: add CREDITS.md`
- [ ] **Step 4:** Run gitleaks on `origin/main..HEAD`, push, and open a PR to `main`.
