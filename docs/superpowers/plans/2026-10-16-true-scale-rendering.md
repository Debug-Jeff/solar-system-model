# True-Scale Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real distances and real sizes in kilometres. Objects you can't resolve on screen become colored markers with labels; zooming in reveals the real body. Selecting a body flies the camera to it. Orbits are colored by type, and touch works properly.

**Architecture:**
- **Units and precision:**
  - One scene unit = 1 km.
  - Every position stays a float64 JS number on the CPU. Three.js computes `modelViewMatrix` in float64 before uploading, so meshes don't jitter.
  - The only large-coordinate vertex data is orbit lines. Each line is stored **relative to a local origin** (the body's position when the line was built) and drawn at that origin.
  - `WebGLRenderer({ logarithmicDepthBuffer: true })` handles depth from 10 m to 10¹² km.
- **Markers:** a DOM layer of colored ring markers with labels replaces `labels.ts`. They are clickable (44 px tap targets) and culled by priority when they overlap. Moon markers and orbits are hidden until their parent's moon system spans enough pixels on screen.
- **Camera:** OrbitControls stays. Selecting a body runs a 1.2 s eased fly-to, ending `flyToDistance(radius)` away, and then follows the body. The control distance limits adapt to the followed body.

**Tech Stack:** Three.js r186, TypeScript, React (no HUD changes beyond markers), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-16-eyes-redesign-design.md`. This plan is branch 3 of 12. Jeff dropped compressed scale, so `engine/scale.ts` is deleted.

## Global Constraints

- Branch `feat/true-scale-rendering` from `main`, with its PR to `main`. Jeff has authorized merging to `main` once review fixes are in and CI is green.
- Conventions from earlier plans: no comments, conventional commits, no attribution, npm, strict TS, no raw HTML sinks (CI-guarded), and marker text set with `textContent`.
- `AU_KM = 149_597_870.7`. Scene mapping is still `(x, z, −y)` of ecliptic, now in km.
- **Orbit colors:**
  - planets: their `body.color` from data
  - dwarf planets: `body.color` at 70% lightness
  - moons: parent color at 50% opacity
  - comets `#7fe0ff`; asteroids, reserved for branch 6, `#c9a77a`
  - The selected body's orbit gets opacity 1 and the rest 0.45.
- **Marker colors** match the orbit color.
- **Marker priority** (higher wins an overlap): star 5, planet 4, dwarfPlanet 3, comet 2, moon 1. The selected body is always shown.
- **Moon LOD:** a moon's marker and orbit are shown only when its orbit radius projects to **24 px or more**.
- **Mesh vs marker:** the marker ring hides when the body's projected radius is **8 px or more**. The label stays.
- **Fly-to:**
  - Duration 1200 ms with ease-in-out cubic.
  - End distance `flyToDistance(radiusKm) = radiusKm * 4`, and never less than 0.05 km, which keeps future spacecraft framable.
  - After arrival, follow. `controls.minDistance = radiusKm * 1.2` while following, and `1` otherwise. `controls.maxDistance = 200 * AU_KM`.
- **Initial and reset view:** camera at about 7 AU, 35° above the ecliptic, looking at the Sun.
- Touch is handled by OrbitControls' default `ONE: ROTATE, TWO: DOLLY_PAN`. Taps are detected per `pointerId` and cancelled by multi-touch or `pointercancel`. This fixes the pinch-as-tap minor from branch 1.

## Review Focus

1. **Zoomed in close to a planet near Neptune** (about 30 AU from the origin). There must be no visible jitter of the mesh or its orbit line. Covered in Task 2 (relative-origin orbit test) and Task 5 (manual check at Neptune).
2. **A pinch that ends with one finger lifted over a marker or body** must not select anything. Covered in Task 3, `tap.test.ts`.
3. **Selecting a new body mid fly-to** retargets smoothly from the current camera pose, with no jump back to the old start. Covered in Task 3, `flyTo.test.ts`.
4. **Many markers in one screen region** (the Jupiter or Saturn moon systems from far away) collapse to the highest priority, so the screen never fills with label soup. Covered in Task 4, `markers.test.ts`.
5. **A body behind the camera or outside the frustum** doesn't show a marker at a mirrored position. Covered in Task 4 (projection test with z > 1).

---

### Task 1: Units, frames and projection helpers

**Files:** Modify `engine/frames.ts` and `frames.test.ts`. Create `engine/projection.ts` and `projection.test.ts`. Delete `engine/scale.ts` and `scale.test.ts`, but only once Task 5 removes the last import, so delete them there and make this task additive.

**Produces:**
- `AU_KM: number`
- `eclipticKmToScene(v: Vec3 /* AU */, out: THREE.Vector3): THREE.Vector3`, which scales by AU_KM and maps axes
- `projectedRadiusPx(radiusKm: number, distanceKm: number, fovYRad: number, viewportHeightPx: number): number`, equal to `(radiusKm / (distanceKm * tan(fovY/2))) * viewportHeightPx/2`, and `Infinity` when distance ≤ radius
- `projectToScreen(world: THREE.Vector3, camera: THREE.Camera, width: number, height: number): { x: number; y: number; visible: boolean }`, where visible is false when NDC z > 1 or the point lies outside the NDC x/y range [−1.2, 1.2]

- [ ] **Step 1: Failing tests.**
  - `eclipticKmToScene({x:1,y:0,z:0})` gives `(AU_KM, 0, 0)`.
  - June solstice handedness: on 2026-06-21 08:24 UTC, Earth's heliocentric longitude is about 270°, so the ecliptic direction is (0,−1,0), which maps to scene **+Z**. Its angle to +Z is under 1°. (Deferred minor from branch 2.)
  - `projectedRadiusPx(6371, 6371*4, 45°, 1000)` ≈ 301.8.
  - At distance ≤ radius the result is Infinity.
  - `projectToScreen`: a point straight ahead is centered and visible. A point behind the camera is `visible: false`.
- [ ] **Step 2: Run and confirm FAIL.** **Step 3: Implement.** **Step 4: Run and confirm PASS.**
- [ ] **Step 5: Commit** `feat(engine): kilometre frame mapping and screen projection helpers`

---

### Task 2: Orbit styling and relative-origin orbit lines

**Files:** Create `engine/orbitStyle.ts` and `orbitStyle.test.ts`.

**Produces:**
- `orbitColor(body: Body, parent: Body | null): { color: string; opacity: number }`, following the Global Constraints
- `relativePositions(points: THREE.Vector3[], origin: THREE.Vector3): Float32Array`, which returns xyz triples of `point − origin` computed in float64 before conversion
- `ORBIT_OPACITY = { normal: 0.45, selected: 1 }`

- [ ] **Step 1: Failing tests.**
  - Mars → `body.color`.
  - Ceres (dwarfPlanet) → a lighter version of its color.
  - Halley → `#7fe0ff`.
  - The Moon with parent Earth → Earth's color at opacity 0.5.
  - A point 30 AU out, 1 km from the origin, converts to exactly `1` in Float32 via `relativePositions`. The naive `Float32Array.of(30*AU_KM + 1) − 30*AU_KM` is not 1, which proves the precision problem is real.
- [ ] **Step 2: FAIL.** **Step 3: Implement.** **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(engine): type-coloured orbits and precision-safe orbit line vertices`

---

### Task 3: Taps, fly-to and follow

**Files:**
- Create `engine/tap.ts`, `engine/flyTo.ts` and tests for both.
- Rewrite `engine/follow.ts` and its test.

**Produces:**
- `createTapDetector(thresholdPx = 5): { down(e: { pointerId: number; x: number; y: number }): void; up(e: { pointerId: number; x: number; y: number }): boolean; cancel(pointerId: number): void }`
  - `up` returns true only when this pointer is the only one that went down during the gesture and it moved 5 px or less.
- `easeInOutCubic(t: number): number`
- `flyToDistance(radiusKm: number): number`
- `createCameraFlight(camera, controls): { start(targetKm: THREE.Vector3, distanceKm: number, nowMs: number): void; update(targetKm: THREE.Vector3, nowMs: number): boolean; active: boolean }`
  - It interpolates `controls.target` from the current target to the moving body, and the camera from its current position to `target + dir * distance`, where `dir` is the current view direction.
  - `update` returns false once the flight is done.
  - `start` during a flight begins from the **current** interpolated pose.
- `createFollowController` keeps its interface. `start()` now triggers a flight, then follows by translating camera and target by the body's per-frame displacement, which keeps the user's orbit and zoom. `FOLLOW_SMOOTHNESS` is removed, because translation by displacement is exact.

- [ ] **Step 1: Failing tests.**
  - Taps:
    - A down/up within 5 px → tap.
    - Two pointers down, then one up within 5 px → not a tap.
    - After `cancel` → not a tap.
    - Movement over 5 px → not a tap.
  - `easeInOutCubic`: 0 → 0, 1 → 1, 0.5 → 0.5, and it is monotonic.
  - `flyToDistance`: 6371 → 25484, and 0.001 → 0.05.
  - Flight: at t = 0 the camera hasn't moved. At t ≥ 1200 ms the camera is `distance` from the target, `update` returns false, and the target equals the body.
  - Retarget mid-flight: start A, advance 600 ms, start B. The next update's camera position is within 1e-6 of the pre-retarget position.
  - Follow: after arrival, moving the body by (+1000, 0, 0) moves the camera and target by exactly the same amount.
- [ ] **Step 2: FAIL.** **Step 3: Implement.** **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(engine): multi-touch-safe taps, eased fly-to and exact follow`

---

### Task 4: Marker layer

**Files:**
- Create `engine/markers.ts` and `markers.test.ts`.
- Delete `engine/labels.ts`.
- Add marker CSS (`.marker`, `.marker-ring`, `.marker-label`, `.marker.selected`, `.marker.ring-hidden`) to `hud/style.css`. The existing `.planet-label` rules can be removed.

**Produces:**
- `MARKER_PRIORITY: Record<BodyType, number>`
- `cullMarkers(items: { id: string; x: number; y: number; w: number; h: number; priority: number; selected: boolean }[]): Set<string>`
  - Greedy: sort by selected first, then priority descending, then input order. Accept an item if its rect doesn't overlap any rect already accepted.
- `moonVisible(moonOrbitRadiusPx: number): boolean`, which is true when the value is 24 or more
- `createMarkerLayer(container: HTMLElement, onSelect: (id: string) => void): { update(entries: MarkerEntry[], camera: THREE.PerspectiveCamera, width: number, height: number, selectedId: string | null): void; setEnabled(on: boolean): void; dispose(): void }`
  - `MarkerEntry = { id; name; type; color; worldKm: THREE.Vector3; radiusKm; parentId: string | null; orbitRadiusKm: number }`
  - Each marker is a `<button class="marker" aria-label={name}>` containing a ring span and a label span, with text set by `textContent`. Clicking calls `onSelect(id)`.
  - The label rect estimate is `name.length * 7 + 22` × 18 px.

- [ ] **Step 1: Failing tests.**
  - `cullMarkers`: two overlapping items with priorities 4 and 1 → only the 4. A selected moon overlapping a planet → both the selected moon and... the selected item wins, and the planet is dropped. Non-overlapping items are all kept.
  - `moonVisible(23.9)` is false and `moonVisible(24)` is true.
  - Layer (jsdom with a real PerspectiveCamera):
    - A body in front gets a visible `button[aria-label="Mars"]`.
    - A body behind the camera gets `display: none`.
    - Clicking the button calls `onSelect('mars')`.
    - A name containing `<b>x</b>` renders as text.
- [ ] **Step 2: FAIL.** **Step 3: Implement.** **Step 4: PASS.**
- [ ] **Step 5: Commit** `feat(engine): clickable, priority-culled body markers with moon level of detail`

---

### Task 5: True scale in the engine

**Files:** Modify `engine/scene.ts`, `bodies.ts`, `engine.ts`, `smallBodies.ts`, `textures.ts` if needed, and `follow.test.ts`. Delete `engine/scale.ts`, `scale.test.ts`, `labels.ts` and `picking.ts`, after moving `pickBody` into `engine.ts` or `tap.ts`, and their tests.

**Changes:**
- **scene:**
  - `logarithmicDepthBuffer: true`, `near = 1e-5`, `far = 1e12`.
  - The starfield sphere has radius `1e11`, `depthWrite: false`, and its position is copied from the camera every frame.
  - The Sun gets an additive glow `Sprite` with `sizeAttenuation: false` and a screen size of about 0.08.
  - `INITIAL_CAMERA_POSITION` and target come from the reset-view rule above.
- **bodies:**
  - True radii: `radiusKm`, and for the Sun `696_340`.
  - Ephemeris bodies are placed with `eclipticKmToScene`.
  - Moons sit at `distanceFromParentKm` around the parent pivot. The placeholder angle stays.
  - Orbit lines:
    - Built with `relativePositions` around the body's current position and placed at that origin.
    - Colored with `orbitColor`.
    - Rebuilt when the body has moved more than 5% of its orbit's size from the line origin, or after a date jump of more than 25 years.
  - The hit mesh is removed; raycast the real meshes for close-up picking.
  - Comet tail length is `clamp(2e7 / r_AU², 2e5, 6e7)` km, with points at `sizeAttenuation: false`, size 2.
- **belts:** positions in km, `sizeAttenuation: false`, size 1.5.
- **engine:**
  - Use the marker layer instead of labels. It fires `store.select` on click.
  - Use the tap detector, with raycasting against the meshes, instead of `isClick`.
  - The follow controller drives the flight. On `followSeq`, the flight goes to the body's `flyToDistance(currentRadius)`.
  - Set `controls.minDistance` and `maxDistance` as described above.
  - Hide moon orbit lines whenever `moonVisible` is false.
  - Keep the `layers.labels` toggle on the marker layer.
- **store/HUD:** no API change.

- [ ] **Step 1: Update `follow.test.ts`** for the new semantics, then run and confirm FAIL. Add a `bodies` test only where pure helpers exist; the rest is checked in the browser.
- [ ] **Step 2: Implement** the changes above. Delete the dead modules and tests.
- [ ] **Step 3: Verify.** `npm run typecheck && npm test && npm run build` and the HTML-sink grep. Expected: green.
- [ ] **Step 4: Browser check, desktop and 390×844 touch:**
  - The initial view shows the inner system with colored orbits and markers, and no label soup.
  - Clicking the Jupiter marker flies there, and the Galilean moons appear as you approach.
  - Zooming to a cloud-level view of Earth has no z-fighting with the clouds.
  - Selecting Neptune and zooming in close shows no jitter of the mesh or orbit line.
  - Halley's orbit is cyan and dashed when selected.
  - Reset View returns home.
  - Pinch-zoom on touch doesn't select anything.
  - No console errors except the favicon.
- [ ] **Step 5: Commit** `feat(engine): true-scale solar system with log depth, markers and fly-to`

---

### Task 6: Push, review, merge

- [ ] CI-equivalent locally, then gitleaks, push, PR to `main`, whole-branch review, the fix pass, CI green, and a fast-forward merge to `main` (authorized by Jeff).
