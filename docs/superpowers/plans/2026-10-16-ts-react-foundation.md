# TS + React Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the frontend from plain JS to strict TypeScript, with a framework-free engine and a React HUD that share one store. Behavior stays the same, except that the scale toggle is removed.

**Architecture:**
- The Three.js engine (`src/engine/`) is plain TypeScript. It owns the canvas, the render loop and the DOM label layer.
- The React HUD (`src/hud/`) renders every control and panel.
- They talk only through a vanilla Zustand store (`src/state/store.ts`): the engine reads it with `store.getState()` / `store.subscribe`, and React reads it with `useStore`.
- The engine is created in `main.tsx`, outside React, so StrictMode double-mounting can never create two engines.

**Tech Stack:** TypeScript (strict), Vite 8, React 19 + react-dom, @vitejs/plugin-react, Zustand 5, three r186 + @types/three, Vitest + jsdom + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-10-16-eyes-redesign-design.md`. This plan is branch 1 of 12: `feat/ts-react-foundation`.

## Global Constraints

- Branch `feat/ts-react-foundation`, cut from `feat/eyes-redesign`. That branch holds the spec and hasn't merged yet, so this branch is stacked on it. Its PR targets `feat/eyes-redesign`.
- **No code comments in source files** (Jeff's convention).
- Conventional commits. No AI attribution in commits or code.
- npm, using the lockfile in `frontend/`. Never pnpm here.
- `tsconfig`: `"strict": true`, `"noUncheckedIndexedAccess": true`, `"noEmit": true`. No `any` except at JSON parse boundaries, where values are immediately narrowed.
- **No `innerHTML`, `insertAdjacentHTML` or `dangerouslySetInnerHTML` anywhere in `frontend/src`.**
- The NASA key never appears in the frontend. `VITE_API_BASE_URL` stays the only frontend env variable.
- Keep `@vercel/speed-insights` injection.
- **The compressed "visual" scale stays as the only rendering scale in this branch.** The true-scale toggle and the `*True*` scale functions are deleted. `feat/true-scale-rendering` replaces the scale later.
- Existing behavior must survive: bodies, moons, comets with tails, both belts, orbit lines, labels, click-to-select with info panel, follow mode with indicator, play/pause, speed slider from −3 to 3, date jump, APOD panel, live EPIC panel, the live GIBS Earth texture toggle, reset view, and the loading overlay.
- Run `gitleaks git --log-opts="origin/feat/eyes-redesign..HEAD"` before each push.

## Review Focus

1. **The backend is unreachable or returns 5xx at startup.** The loading overlay must show the error (`'Failed to load — is the backend running on :8080?'` in dev, `'Failed to load the solar system. Please try again later.'` in prod) instead of a blank page or an uncaught rejection. Covered in Task 5, `bootstrap.test.ts`.
2. **The date jump gets empty, malformed or absurd input** (`''`, `'abc'`, `'99999-01-01'`). The sim time stays unchanged and never becomes `NaN`. Covered in Task 3, `store.test.ts`.
3. **The APOD or EPIC fetch fails, or the button is double-clicked.** The button is disabled while loading, re-enabled after a failure, and an error message is shown instead of a stuck button. Covered in Task 5, `TopBar.test.tsx`.
4. **Fetched text contains HTML** (an APOD `explanation` or `title` with `<img src=x onerror=...>`). It renders as literal text. Covered in Task 5, `NasaPanel.test.tsx`.
5. **A touch drag on mobile ends over a body.** That is a drag, not a selection, so selection fires only when the pointer moved 5 px or less. Covered in Task 4, `picking.test.ts`.

---

## File Structure

```
frontend/
  index.html                 canvas#scene, div#labels-layer, div#hud-root, script /src/main.tsx
  package.json               scripts: dev, build (tsc -b && vite build), preview, test (vitest run), typecheck (tsc -b)
  tsconfig.json              strict app config (src)
  tsconfig.node.json         vite.config.ts
  vite.config.ts             react plugin, existing /api proxy, vitest config (jsdom env for *.test.tsx)
  src/
    main.tsx                 bootstrap(): store → fetch planets → engine → mount HUD; error → store
    bootstrap.ts             startApp(deps) pure-ish orchestration, testable
    types/body.ts            Body, BodyType
    api/client.ts            API_BASE, fetchPlanets, fetchApod, fetchLatestEpic, types ApodResponse, EpicItem
    state/store.ts           createAppStore(), AppState, AppActions
    engine/
      engine.ts              createEngine(opts): EngineHandle
      scene.ts               createScene(canvas) (port of scene.js)
      textures.ts            textures, loadLiveEarthTexture, createTextureLoading(onProgress, onDone)
      bodies.ts              createBodies(scene, planets) (port, visual scale only)
      orbit.ts               keplerianPosition, ellipticalPosition, ellipsePoints, eccentricAnomaly
      scale.ts               visual-scale functions only (port of data/scale.js)
      smallBodies.ts         createSmallBodyBelt (port)
      labels.ts              createLabelManager (port)
      follow.ts              createFollowController(camera, controls)
      picking.ts             isClick(down, up, thresholdPx), pickBody(...)
    hud/
      App.tsx                layout; composes the components below
      TopBar.tsx             title, sim date, APOD + Live Earth buttons
      InfoPanel.tsx          selected body details
      NasaPanel.tsx          APOD/EPIC image panel
      TimeControls.tsx       play/pause, speed slider, jump-to-date button
      DateModal.tsx          date input modal
      LayerToggles.tsx       orbits, labels, live Earth texture
      FollowIndicator.tsx    "Tracking X" pill
      LoadingOverlay.tsx     progress + error text
      format.ts              formatNumber, formatPeriod, formatRotation, formatDistance, formatType, formatSpeed, formatSimDate
      useAppStore.ts         typed hook over the vanilla store
      style.css              moved from src/style.css, same ids/classes
```

Deleted at the end: `src/*.js`, `src/data/scale.js`, `src/style.css` (moved).

---

### Task 1: TypeScript and Vitest tooling, plus the pure orbit and scale modules

**Files:**
- Modify: `frontend/package.json`, `frontend/index.html` (no change yet)
- Create: `frontend/tsconfig.json`, `frontend/tsconfig.node.json`, `frontend/vite.config.ts`
- Delete: `frontend/vite.config.js`
- Create: `frontend/src/engine/orbit.ts`, `frontend/src/engine/scale.ts`
- Test: `frontend/src/engine/orbit.test.ts`, `frontend/src/engine/scale.test.ts`

**Interfaces:**
- Produces:
  - `eccentricAnomaly(meanAnomaly: number, eccentricity: number): number`
  - `keplerianPosition(meanAnomaly: number, semiMajorAxis: number, eccentricity: number): { x: number; z: number }`
  - `ellipticalPosition(theta: number, semiMajorAxis: number, eccentricity: number): { x: number; z: number }`
  - `ellipsePoints(semiMajorAxis: number, eccentricity: number, segments?: number): number[]`
  - `planetVisualRadius(radiusKm: number): number`, `sunVisualRadius(): number`
  - `moonVisualRadius(radiusKm: number, parentVisualRadius: number, parentRadiusKm: number): number`
  - `orbitVisualDistance(distanceAU: number): number`
  - `moonVisualDistance(distanceParentKm: number, parentVisualRadius: number): number`

- [ ] **Step 1: Branch and install**

```bash
git switch feat/eyes-redesign && git pull --ff-only && git switch -c feat/ts-react-foundation
cd frontend
npm i react react-dom zustand
npm i -D typescript @types/react @types/react-dom @types/three @vitejs/plugin-react vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

Pin `@types/three` to the `0.186.x` line so it matches `three@^0.186.1`.

- [ ] **Step 2: Add the configs and scripts**

- Scripts: `"build": "tsc -b && vite build"`, `"typecheck": "tsc -b"`, `"test": "vitest run"`.
- `vite.config.ts`: `react()` plugin, the existing `server.port: 5173` and `/api → http://localhost:8080` proxy, and `test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'] }`. `src/test-setup.ts` imports `@testing-library/jest-dom/vitest`.
- `tsconfig.json`: `include: ["src"]`, `"jsx": "react-jsx"`, `"module": "ESNext"`, `"moduleResolution": "bundler"`, `"types": ["vite/client"]`, plus the strict flags from Global Constraints.

- [ ] **Step 3: Write the failing tests**

```ts
// orbit.test.ts
test('eccentricAnomaly solves Kepler', () => {
  const M = 1.2, e = 0.6
  const E = eccentricAnomaly(M, e)
  expect(E - e * Math.sin(E)).toBeCloseTo(M, 9)
})
test('keplerianPosition at M=0 is perihelion a(1-e) on +x', () => {
  const p = keplerianPosition(0, 10, 0.2)
  expect(p.x).toBeCloseTo(8, 9); expect(p.z).toBeCloseTo(0, 9)
})
test('keplerianPosition at M=π is aphelion a(1+e) on -x', () => {
  const p = keplerianPosition(Math.PI, 10, 0.2)
  expect(p.x).toBeCloseTo(-12, 9)
})
test('circular orbit keeps radius', () => {
  for (const M of [0.3, 2, 4.4]) { const p = keplerianPosition(M, 5, 0); expect(Math.hypot(p.x, p.z)).toBeCloseTo(5, 9) }
})
test('ellipsePoints closes the loop with segments+1 xyz triples', () => {
  const pts = ellipsePoints(3, 0.1, 8)
  expect(pts).toHaveLength(27)
  expect(pts.slice(0, 3)).toEqual(pts.slice(24, 27).map((v) => expect.closeTo(v, 9)))
})
// scale.test.ts
test('earth visual radius is 1.6', () => expect(planetVisualRadius(6371)).toBeCloseTo(1.6, 9))
test('sun visual radius is 10', () => expect(sunVisualRadius()).toBe(10))
test('orbitVisualDistance(1 AU) = 18 + 16', () => expect(orbitVisualDistance(1)).toBeCloseTo(34, 9))
test('moonVisualDistance at lunar distance', () => expect(moonVisualDistance(384_400, 1.6)).toBeCloseTo(1.6 * 2.6 + 3.4, 9))
```

- [ ] **Step 4: Run the tests and confirm they fail**

Run: `npm test`. Expected: FAIL, because the modules aren't found.

- [ ] **Step 5: Port `orbit.js` and the visual half of `data/scale.js` to `src/engine/orbit.ts` and `src/engine/scale.ts`**

Export `eccentricAnomaly`, which is private in the JS version. Drop every `*True*` function and `TRUE`.

- [ ] **Step 6: Run the tests and typecheck**

Run: `npm test && npx tsc -p tsconfig.json --noEmit`. Expected: all pass, 0 type errors. The old `.js` files still exist and aren't compiled yet. `npm run dev` still serves `src/main.js`, because `index.html` is unchanged.

- [ ] **Step 7: Commit**

```bash
git add frontend && git commit -m "build(frontend): add TypeScript, React and Vitest tooling; port orbit and scale math"
```

---

### Task 2: Body types and the typed API client

**Files:**
- Create: `frontend/src/types/body.ts`, `frontend/src/api/client.ts`
- Test: `frontend/src/api/client.test.ts`

**Interfaces:**
- Produces:
  - `type BodyType = 'star' | 'planet' | 'dwarfPlanet' | 'moon' | 'comet'`
  - `interface Body { id: string; name: string; type: BodyType; radiusKm: number; distanceFromSunAU?: number; distanceFromParentKm?: number; parent?: string; orbitalEccentricity?: number; orbitalInclinationDeg?: number; orbitalPeriodDays: number; rotationPeriodHours: number; axialTiltDeg: number; meanTempC: number; moonCount: number; color?: string; retrograde?: boolean; facts: string[] }`. The field list must match `backend/data/planets.json`, so check every key in that file is covered.
  - `const API_BASE: string`
  - `fetchPlanets(): Promise<Body[]>`
  - `fetchApod(): Promise<ApodResponse>`, where `ApodResponse = { title: string; date?: string; url: string; hdurl?: string; explanation: string; media_type?: string }`
  - `fetchLatestEpic(): Promise<EpicItem>`, where `EpicItem = { date: string; caption: string; imageUrl: string }` and `imageUrl` is already prefixed with `API_BASE`

- [ ] **Step 1: Write the failing tests** (mock `fetch` with `vi.stubGlobal`)

```ts
test('fetchPlanets returns data.bodies', async () => { /* fetch → {bodies:[{id:'sun',...}]} */ expect((await fetchPlanets())[0]!.id).toBe('sun') })
test('non-2xx rejects with url and status', async () => { /* status 503 */ await expect(fetchApod()).rejects.toThrow('/api/apod responded 503') })
test('fetchLatestEpic picks the last item and prefixes imageUrl', async () => { /* [{imageUrl:'/api/epic/image?a'},{imageUrl:'/api/epic/image?b',date:'2026-10-15 00:00:00',caption:'c'}] */ expect((await fetchLatestEpic()).imageUrl).toBe(API_BASE + '/api/epic/image?b') })
test('fetchLatestEpic rejects on an empty list', async () => { await expect(fetchLatestEpic()).rejects.toThrow('no EPIC imagery available') })
test('fetchPlanets rejects when bodies is not an array', async () => { /* {bodies:null} */ await expect(fetchPlanets()).rejects.toThrow() })
```

- [ ] **Step 2: Run and confirm FAIL** (`npm test -- client`)
- [ ] **Step 3: Implement** by porting `api.js`. Narrow parsed JSON with small `Array.isArray` / `typeof` checks so the result is never cast blindly.
- [ ] **Step 4: Run and confirm PASS**
- [ ] **Step 5: Commit** `feat(frontend): typed API client and body types`

---

### Task 3: App store

**Files:**
- Create: `frontend/src/state/store.ts`
- Test: `frontend/src/state/store.test.ts`

**Interfaces:**
- Consumes: `Body` (Task 2)
- Produces:

```ts
export const BASE_SIM_HOURS_PER_SECOND = 24
export const SIM_START_MS = Date.UTC(2026, 9, 16)
export type NasaPanelContent = { title: string; imageUrl: string; caption: string }
export interface AppState {
  bodies: Body[]
  simTimeMs: number
  speed: number
  lastNonzeroSpeed: number
  selectedId: string | null
  followId: string | null
  layers: { orbits: boolean; labels: boolean; liveEarthTexture: boolean }
  nasaPanel: NasaPanelContent | null
  dateModalOpen: boolean
  loading: { active: boolean; text: string; error: string | null }
  simJumpSeq: number
  resetViewSeq: number
}
export interface AppActions {
  setBodies(bodies: Body[]): void
  advance(realSeconds: number): void
  setSpeed(speed: number): void
  togglePlay(): void
  jumpToDate(isoDate: string): boolean
  select(id: string | null): void
  stopFollow(): void
  setLayer(layer: keyof AppState['layers'], on: boolean): void
  showNasaPanel(c: NasaPanelContent): void
  closeNasaPanel(): void
  setDateModalOpen(open: boolean): void
  setLoading(p: Partial<AppState['loading']>): void
  resetView(): void
}
export type AppStore = StoreApi<AppState & AppActions>
export function createAppStore(): AppStore
```

Semantics:
- `select(id)` sets both `selectedId` and `followId`. `select(null)` clears `selectedId` only.
- `jumpToDate` accepts only `YYYY-MM-DD` that is a valid UTC date with year 1900–2050. It sets `simTimeMs` and increments `simJumpSeq` (which the engine watches so it can snap), returns `true`, and otherwise returns `false` and leaves state unchanged.
- `resetView` clears `followId` and increments `resetViewSeq`.
- `speed` is clamped to −3..3.

- [ ] **Step 1: Write the failing tests**

```ts
test('advance adds speed × 24 sim hours per real second', () => { s.getState().setSpeed(2); s.getState().advance(0.5); expect(s.getState().simTimeMs).toBe(SIM_START_MS + 24 * 3600_000) })
test('togglePlay pauses then restores last non-zero speed', () => { setSpeed(-1.5); togglePlay(); expect(speed).toBe(0); togglePlay(); expect(speed).toBe(-1.5) })
test('setSpeed clamps to [-3, 3]', () => { setSpeed(9); expect(speed).toBe(3) })
test.each(['', 'abc', '2026-13-01', '2026-02-30', '99999-01-01', '1899-12-31', '2051-01-01'])('jumpToDate rejects %s', (v) => { const before = s.getState().simTimeMs; expect(jumpToDate(v)).toBe(false); expect(s.getState().simTimeMs).toBe(before); expect(Number.isNaN(s.getState().simTimeMs)).toBe(false) })
test('jumpToDate accepts a valid date and bumps simJumpSeq', () => { expect(jumpToDate('2030-01-02')).toBe(true); expect(simTimeMs).toBe(Date.UTC(2030, 0, 2)); expect(simJumpSeq).toBe(1) })
test('select sets selection and follow; select(null) keeps follow', () => { select('mars'); select(null); expect(selectedId).toBeNull(); expect(followId).toBe('mars') })
test('resetView clears follow and bumps resetViewSeq', ...)
```

- [ ] **Step 2: Run and confirm FAIL**
- [ ] **Step 3: Implement** with `createStore` from `zustand/vanilla`. Date validation uses a regex `^\d{4}-\d{2}-\d{2}$` plus a round-trip `Date.UTC` comparison.
- [ ] **Step 4: Run and confirm PASS**
- [ ] **Step 5: Commit** `feat(frontend): app store shared by engine and HUD`

---

### Task 4: Port the engine and drive it from the store

**Files:**
- Create: `frontend/src/engine/{engine,scene,textures,bodies,smallBodies,labels,follow,picking}.ts`
- Test: `frontend/src/engine/picking.test.ts`, `frontend/src/engine/follow.test.ts`

**Interfaces:**
- Consumes: `AppStore` (Task 3), orbit and scale (Task 1), `Body` and `loadLiveEarthTexture`'s API base (Task 2)
- Produces:
  - `isClick(down: { x: number; y: number }, up: { x: number; y: number }, thresholdPx = 5): boolean`
  - `createFollowController(camera: THREE.PerspectiveCamera, controls: OrbitControls): { start(): void; stop(): void; update(target: THREE.Vector3): void }`. Same constants as today: `FOLLOW_SMOOTHNESS = 0.08`, `FOLLOW_CAM_DISTANCE = 18`.
  - `createTextureLoading(onProgress: (loaded: number, total: number) => void, onDone: () => void): void`, called before the textures are first used. `textures.ts` must not touch the DOM.
  - `createEngine(opts: { canvas: HTMLCanvasElement; labelsLayer: HTMLElement; store: AppStore }): EngineHandle`, where `EngineHandle = { dispose(): void }`

Engine responsibilities:
- On each frame: `store.getState().advance(delta)`, then update bodies and belts by `deltaSimHours = delta × speed × 24`, then follow, labels and render.
- Subscriptions:
  - `simJumpSeq` change → `bodies.snapToTime((simTimeMs − SIM_START_MS) / 3.6e6)`
  - `resetViewSeq` change → reset the camera to `INITIAL_CAMERA_POSITION` and the target to the origin, and stop follow
  - `followId` → follow start/stop
  - `layers.orbits` → `setOrbitsVisible`
  - `layers.labels` → `labels.setEnabled`
  - `layers.liveEarthTexture` → swap the Earth map. On failure, call `setLayer('liveEarthTexture', false)` and `console.warn`.
- Pointer: `isClick`, then raycast, then `store.select(id | null)`, with comet orbit visibility following the selection as it does today.
- `dispose()` cancels the animation frame, unsubscribes, disposes the renderer and controls, and is safe to call twice.

- [ ] **Step 1: Write the failing tests**

```ts
test('isClick true at ≤5px', () => expect(isClick({x:0,y:0},{x:3,y:4})).toBe(true))
test('isClick false for a drag over 5px', () => expect(isClick({x:0,y:0},{x:6,y:0})).toBe(false))
test('follow start places camera FOLLOW_CAM_DISTANCE from target along current view direction', () => {
  // camera at (0,0,100), controls.target (0,0,0), start(), update(new Vector3(50,0,0)) → camera at (50,0,18), target (50,0,0)
})
test('follow update lerps 8% toward the moving target', () => { /* second update with target moved +10 x → controls.target.x ≈ 50.8 */ })
```

Use a plain `{ target: new THREE.Vector3() }` object cast to `OrbitControls` in the follow tests.

- [ ] **Step 2: Run and confirm FAIL**
- [ ] **Step 3: Port** `scene.js`, `textures.js`, `bodies.js`, `smallBodies.js` and `labels.js` to TS. Remove `setTrueScale`, `applyScale(trueScale)` branching and every `*True*` import; bodies always use the visual scale. Extract follow and picking from `main.js` into their modules. Write `engine.ts` as described above.
- [ ] **Step 4: Run tests and typecheck.** Expected: PASS, and `tsc -b` reports 0 errors.
- [ ] **Step 5: Commit** `refactor(frontend): port engine to TypeScript and drive it from the store`

---

### Task 5: The React HUD and bootstrap, with the old JS removed

**Files:**
- Create: `frontend/src/main.tsx`, `frontend/src/bootstrap.ts`, `frontend/src/hud/*.tsx`, `frontend/src/hud/format.ts`, `frontend/src/hud/useAppStore.ts`
- Move: `frontend/src/style.css` → `frontend/src/hud/style.css`
- Modify: `frontend/index.html`
- Delete: `frontend/src/{main,ui,api,scene,bodies,smallBodies,labels,textures,orbit}.js`, `frontend/src/data/scale.js`
- Test: `frontend/src/hud/format.test.ts`, `frontend/src/hud/NasaPanel.test.tsx`, `frontend/src/hud/TopBar.test.tsx`, `frontend/src/hud/TimeControls.test.tsx`, `frontend/src/bootstrap.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `startApp(deps: { store: AppStore; fetchPlanets: () => Promise<Body[]>; createEngine: (store: AppStore) => EngineHandle; isDev: boolean }): Promise<void>`. On success it calls `setBodies`, then creates the engine. On failure it calls `setLoading({ error: isDev ? 'Failed to load — is the backend running on :8080?' : 'Failed to load the solar system. Please try again later.' })`, logs with `console.error`, and never rethrows.
  - Formatters, ported from `ui.js` with an optional `locale?: string` last parameter: `formatNumber(n, digits?, locale?)`, `formatPeriod(days, locale?)`, `formatRotation(hours, locale?)`, `formatDistance(body, locale?)`, `formatType(type)`, `formatSpeed(v)`, and `formatSimDate(ms)`. `formatSimDate` returns `'Oct 16, 2026'` for `SIM_START_MS`.
  - `useAppStore<T>(selector: (s: AppState & AppActions) => T): T`

HUD rules:
- Keep the existing element ids and class names, so `style.css` keeps working unchanged.
- The loading overlay hides when texture loading finishes, unless `loading.error` is set.
- The APOD and Live Earth buttons are disabled while their request is in flight. On failure they re-enable and show `'Could not load — try again.'` inline next to the buttons.
- Closing the date modal with Escape, Cancel or Go works as today. An invalid date keeps the modal open and shows `'Enter a date between 1900 and 2050.'`.

- [ ] **Step 1: Write the failing tests**

```ts
// format.test.ts
test('formatPeriod years', () => expect(formatPeriod(687, 'en-US')).toBe('1.88 yr'))
test('formatPeriod days', () => expect(formatPeriod(87.97, 'en-US')).toBe('87.97 days'))
test('formatRotation retrograde days', () => expect(formatRotation(-5832.5, 'en-US')).toBe('243.02 days (retrograde)'))
test('formatType splits camelCase', () => expect(formatType('dwarfPlanet')).toBe('dwarf Planet'))
test('formatSimDate', () => expect(formatSimDate(SIM_START_MS)).toBe('Oct 16, 2026'))
// NasaPanel.test.tsx
test('HTML in fetched text renders as text', () => {
  store.getState().showNasaPanel({ title: '<img src=x onerror=alert(1)>', imageUrl: '/x.jpg', caption: '<b>hi</b>' })
  render(<NasaPanel store={store} />)
  expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
  expect(document.querySelector('b')).toBeNull()
})
// TopBar.test.tsx
test('APOD button disables while loading and re-enables with an error on failure', async () => { /* onShowApod rejects → button disabled during, enabled after, text 'Could not load — try again.' shown */ })
// TimeControls.test.tsx
test('play button toggles pause and label', async () => { /* click → speed 0, label '▶'; click → speed restored, label '⏸' */ })
test('invalid date keeps modal open with message', async () => { /* type 1800-01-01, Go → message visible, modal open */ })
// bootstrap.test.ts
test('backend failure sets the prod error text and does not throw', async () => {
  await startApp({ store, fetchPlanets: () => Promise.reject(new Error('503')), createEngine: vi.fn(), isDev: false })
  expect(store.getState().loading.error).toBe('Failed to load the solar system. Please try again later.')
})
test('success sets bodies then creates engine', ...)
```

- [ ] **Step 2: Run and confirm FAIL**
- [ ] **Step 3: Implement** the HUD components, `bootstrap.ts` and `main.tsx`. `main.tsx` order:
  1. `injectSpeedInsights()`
  2. `createAppStore()`
  3. `createRoot(#hud-root).render(<StrictMode><App store/></StrictMode>)`
  4. `startApp({ ..., createEngine: (store) => createEngine({ canvas, labelsLayer, store }), isDev: import.meta.env.DEV })`

  Update `index.html` to `canvas#scene`, `div#labels-layer`, `div#hud-root` and `<script type="module" src="/src/main.tsx">`. Delete the old JS files.
- [ ] **Step 4: Run the full verification**

Run: `npm run typecheck && npm test && npm run build`. Expected: 0 type errors, all tests pass, and the build succeeds. The existing three.js chunk-size warning is acceptable.

Run: `grep -rnE "innerHTML|insertAdjacentHTML|dangerouslySetInnerHTML" src`. Expected: no output.

- [ ] **Step 5: Manual check in the browser** (backend running, `npm run dev`). Every item in the Global Constraints "Existing behavior" list works. There's no true-scale checkbox, and there are no console errors. Also check at 390×844 mobile emulation: the HUD is usable and tap-select works.
- [ ] **Step 6: Commit** `feat(frontend): React HUD over the TypeScript engine; remove legacy JS`

---

### Task 6: CI, README and push

**Files:**
- Modify: `.github/workflows/ci.yml` (frontend job), `README.md` (Tests section)

- [ ] **Step 1: In CI, after `npm ci`,** add `npm run typecheck`, `npm test`, and a guard step: `! grep -rnE "innerHTML|insertAdjacentHTML|dangerouslySetInnerHTML" src`. Keep `npm run build`.
- [ ] **Step 2: Add `cd frontend && npm test` to the README Tests block.**
- [ ] **Step 3: Verify locally** with `cd frontend && npm ci && npm run typecheck && npm test && npm run build`. Expected: all green.
- [ ] **Step 4: Commit** `ci(frontend): typecheck, unit tests and unsafe-HTML guard`
- [ ] **Step 5: Push.** Run `gitleaks git --log-opts="origin/feat/eyes-redesign..HEAD" --no-banner`, expecting "no leaks found". Then `git push -u origin feat/ts-react-foundation`. Open the PR with base `feat/eyes-redesign` and ask Jeff to phone-test before merging.
