# Solar System Model: "Eyes"-class redesign

Date: 2026-10-16
Owner: Jeff (Debug-Jeff)
Status: approved 2026-10-16

## Intent

Turn the solar-system-model into something that feels like NASA's Eyes on the Solar System: the solar system as it actually is, right now. Opening the app should show where everything really is today ("LIVE"), and the scene should feel populated: planets, their moons, stars, asteroids, comets, meteor showers, spacecraft and important Earth satellites, each on its own colored orbit. Things move at real rates. Zooming in rewards you: a dot becomes a real-looking world or spacecraft.

Why: Jeff found the Eyes experience compelling because it feels real and alive. This is also a portfolio project, so it has to be his own work, built well, and it has to work well on phones as well as laptops, just as Eyes does.

## Goals

1. **Real positions at real time.** Every object is placed from real orbital data for the current UTC moment. Default time rate is real time (1 s per s). The user can speed up, slow down, pause, reverse, and jump to any date. A "LIVE" badge shows when the display is at the current time and real rate.
2. **True scale** is the primary view: real distances and real sizes, from the whole system down to a single spacecraft, without depth flicker or position jitter.
3. **A populated scene:**
   - the Sun, the 8 planets and the dwarf planets (Ceres, Pluto, Eris, Haumea, Makemake)
   - major moons: at least the ones in `backend/data/planets.json` today, plus Pluto's Charon
   - named asteroids and comets of interest, plus a real sample of the main belt and Kuiper belt drawn from actual orbital elements
   - meteor showers: the streams of the major annual showers, with an "active now" indication
   - deep-space spacecraft
   - about 20–40 important Earth satellites (the list can grow later)
   - a real star catalog with constellation lines
4. **Readable from far away, detailed up close (level of detail).** From far away each object is a marker icon plus a label. Up close it is a textured sphere, a ringed planet, or a 3D model.
5. **Orbit color tells you what things are.** Each planet's orbit color comes from that planet's real color. Each other kind of object has its own color family: asteroids warm grey/tan, comets icy cyan, spacecraft green, Earth satellites a distinct fourth hue, and dwarf planets and moons a muted version of their own color. The selected object's orbit is highlighted. (Chosen in the mockup as "A — coloured by type".)
6. **Works well on mobile:** touch controls, a responsive heads-up display (HUD, the on-screen controls overlay), and adaptive quality. It should not be a degraded afterthought.
7. **Uses Jeff's NASA API key**, server-side only.

## Non-goals (for this project)

- Thousands of Earth satellites (Starlink etc.). Start with the important set; more is a later decision.
- Surface-level exploration such as terrain streaming or landing-site imagery. Higher-resolution textures are fine; tiled terrain is not in scope.
- VR/XR.
- User accounts or saved state beyond a shareable URL.
- Scientific-grade precision. The target is "visually correct", with documented error bounds (see Accuracy).

## Anti-goals (failure even if it "works")

- Copying code from Eyes on the Solar System. Its app code is Caltech/JPL's with no open license. Studying its public behaviour and techniques is fine (see Prior art). Copying code is not.
- A "LIVE" badge on positions that aren't real.
- Exposing the NASA key to the browser: no `VITE_*` variable holding it, and nothing in the bundle.
- Choppy, janky or unusable on a mid-range phone.
- One giant unreviewable rewrite. Work lands in small feature branches that can each be merged on their own.
- Shipping third-party textures, models or data without the attribution their license requires.

## Prior art: how Eyes does it

Learned from its public bundles. Use this as technique reference only.

- An in-house engine called Pioneer, built on Three.js.
- Hybrid position sources. A `DynamoController` streams precomputed binary position samples derived from JPL navigation (SPICE) data for objects that need precision. An `OrbitalElementsController` (orbital elements with keyframes) covers everything else.
- A logarithmic depth buffer, true scale throughout, and per-object `LODComponent`s.
- Hundreds of glTF spacecraft models.
- A `StarfieldComponent` built from a star catalog.
- Map tiles from NASA Trek (WMTS) for the Moon and Mars.

## Constraints

- **Hosting:** frontend on Vercel, backend on Render's free tier. The free tier sleeps when idle (cold starts of roughly 30–60 s) and its disk is wiped on restart. **The app must show correct LIVE positions for the Sun, planets and dwarf planets with zero backend calls.** Backend data adds to the scene; it must never block it.
- **Keys:** `NASA_API_KEY` lives only in the backend environment (`backend/.env` locally, Render dashboard in production).
- **JPL Horizons** doesn't document CORS and throttles parallel requests. Call it only from the backend, one request at a time, and cache aggressively.
- **CelesTrak** asks clients not to re-download unchanged data more often than about every 2 hours. The backend fetches each group at most once per 2 hours and serves it from cache.
- **Repo conventions:**
  - No code comments; Jeff's call, recorded in the vault project note.
  - Conventional commits, one feature branch per feature, committed and pushed as each one is finished.
  - No AI attribution anywhere.
  - npm, because the lockfile is in `frontend/`.
  - Never commit secrets; run gitleaks before pushing.
- **The existing backend hardening stays:** input validation, rate limits, singleflight, the failure cache, size caps and key-free logging. New endpoints follow the same patterns and get `httptest` tests.

## Decided by Jeff

- True scale is the primary view, as in Eyes.
- Mockup **A**: the Eyes-style layout, with orbits colored by type and each planet its real color.
- Planets should look like they do in real life up close.
- Frontend: **TypeScript**, with a **React HUD**. Use whatever tool or language best achieves the result.
- Mobile must work well.
- Use Jeff's NASA API key.
- Important Earth satellites only, for now.
- One branch per feature, committed and pushed.
- Subagents may be used during implementation.

## Architecture (Claude's calls; Jeff may override)

### Frontend

- Vite + TypeScript (strict) + React 19 for the HUD.
- **The engine stays framework-free TypeScript on Three.js** (not React Three Fiber). It owns its own render loop because it needs camera-relative rendering, level of detail and very large point sets. React and the engine share one small store (e.g. Zustand): time, rate, selection, layer toggles and quality tier.
- Precision:
  - Logarithmic depth buffer.
  - **Camera-relative rendering.** World positions are kept in float64 (km) on the CPU. Each frame, the camera position is subtracted before writing to object matrices or uniforms, so the GPU only sees small numbers.
  - Point sets that the GPU propagates (belts) receive a camera-relative offset as a uniform.
- Level of detail and markers:
  - Every object gets a screen-space marker (icon + label) when its projected size is under a few pixels, and its mesh or model above that.
  - Labels are culled by priority and overlap so the screen never becomes soup.
  - Draw labels in WebGL (an SDF text atlas or sprite batch) or in DOM capped at about 150 visible elements. The builder picks, but it must hold the frame budget on mobile.
- Orbits:
  - For bodies propagated from orbital elements, draw the ellipse from those same elements.
  - For bodies with sampled positions, draw the trail from the sampled path.
  - Lines fade with distance, and the selected object's orbit is emphasized.
- Camera: smooth fly-to-object when selected, follow mode (already exists), pinch/drag/rotate on touch, and zoom-to-cursor on desktop.
- Textures and models:
  - Planet textures should be true color.
  - Ship compressed textures (KTX2/Basis) at two or three resolutions, chosen by quality tier and loaded progressively.
  - Spacecraft are glTF/GLB, loaded only when you get close.

### Position sources (hybrid, like Eyes)

1. **Planets and dwarf planets:** analytic, in the client. Use JPL's "Approximate Positions of the Planets" Keplerian elements and their rates (Standish), valid 1800–2050, embedded in the bundle so they work with no backend. The builder may use VSOP87-class series instead if the accuracy is needed.
2. **Moons and spacecraft:** state vectors from JPL Horizons, sampled by the backend over a time window and served as compact arrays that the client interpolates (Hermite or Chebyshev). Outside the window, moons fall back to their mean orbital elements. Outside a spacecraft's mission coverage, the spacecraft is hidden.
3. **Asteroids and comets:**
   - Orbital elements from the JPL Small-Body Database (SBDB) API, propagated with Kepler's equation in the client.
   - Belt samples are propagated on the GPU in a vertex shader (elements stored as per-vertex attributes, time as a uniform).
   - NeoWs (the NASA key) supplies near-Earth objects and close-approach events.
4. **Earth satellites:** GP/OMM element sets from CelesTrak (fetched and cached by the backend), propagated in the client with SGP4 (`satellite.js`, MIT).
5. **Stars:** a bright-star catalog down to about magnitude 6.5 (roughly 9,000 stars), with real color from B−V. Constellation lines from an openly licensed set.

All positions use one frame: J2000 ecliptic, heliocentric km. The scene is drawn relative to the camera.

### Backend (Go, existing service)

New endpoints, each validated, rate limited, cached and tested like the existing ones:

- `GET /api/ephem/:set`: sampled state vectors for a named body set (e.g. `moons-jupiter`, `spacecraft`) over a window around "now". Built by sequential Horizons requests and cached on disk and in memory. The response is compact (binary or compact JSON) with a version and an expiry date.
- `GET /api/smallbodies/:set`: orbital elements for named asteroids and comets plus belt samples, built from SBDB.
- `GET /api/neo`: NeoWs feed (uses the key).
- `GET /api/satellites`: OMM for the curated satellite list from CelesTrak.
- The existing APOD, EPIC and GIBS routes stay.

The free tier's ephemeral disk means the first request after a cold start rebuilds from upstream. Responses carry long `Cache-Control` headers so browsers and Vercel's edge absorb most traffic.

### Data snapshots (resilience)

Because of cold starts, the frontend ships a **static snapshot** of the backend datasets (moon and spacecraft samples, small bodies, satellites, stars), regenerated daily by a scheduled GitHub Action (see "Answered by Jeff"). On load the client uses the snapshot immediately, then quietly swaps in fresh backend data if the backend answers. Satellites are fine from a snapshot that is up to a few days old: SGP4 drift is a few km per day, which is invisible at the scales where satellites are drawn.

## Accuracy targets

- Planets: within 0.1° of heliocentric longitude versus Horizons over 1900–2050.
- Moons and spacecraft inside their sample window: within 1% of orbit radius and 1% of heliocentric distance respectively.
- Earth satellites: SGP4 with elements less than 7 days old.
- Each target needs a test that compares against stored Horizons reference vectors.

## Performance and mobile budgets

- **Quality tiers** (auto-detected from GPU, device memory and screen, and switchable in Settings):
  - High: laptop or desktop.
  - Medium: modern phones.
  - Low: older phones.
  - Tiers control belt particle counts, texture resolution, label caps, antialiasing and pixel ratio.
- **Frame rate:** 60 fps on a mid-range laptop. 30+ fps (aim for 60) on a mid-range phone from around 2022, such as a Pixel 6a or a Galaxy A54.
- **First paint:** the scene with LIVE planet positions under 3 s on a fast connection and under 6 s on 4G. Hi-res textures, models and backend data stream in afterwards.
- **Size:** initial JS under about 400 KB gzipped (Three.js split out and cached). Each texture tier budgeted.
- **Touch:** one-finger orbit, pinch zoom, two-finger pan, tap to select, a bottom sheet for details on narrow screens, and tap targets of at least 44 px.

## HUD (from the mockup)

- **Top bar:** app name, search across every object with jump-to, and a Menu with layers (orbits, labels, constellations, belts, spacecraft, satellites, meteor showers), settings (quality tier, units) and credits.
- **» panel / bottom sheet:** the selected object's details: facts, live distance from the Sun and from Earth, speed, and for spacecraft the mission status. Earth links to the EPIC and GIBS imagery that already exists.
- **Bottom centre:** LIVE badge, UTC/local date and time, and a rate dial (real rate, faster/slower steps, pause, reverse). A tap on LIVE returns to now.
- **Right rail:** info, layers, zoom +/−, fullscreen.
- **Legend:** orbit color families, collapsible.
- **Shareable URL** encoding the selected object, time and camera.

## Feature branches (suggested order)

Each branch is cut from up-to-date `main`, is shippable on its own, and is pushed when green. Merging to `main` is Jeff's call. Branches whose dependencies are met can run in parallel.

1. `feat/ts-react-foundation`: migrate the frontend to TS + React HUD shell + engine module layout + store; Vitest; CI updated. Existing features must keep working.
2. `feat/time-and-ephemeris-core`: UTC sim clock with real rate, LIVE badge, rate dial and date jump; analytic planet positions with correct orientation of each orbit (all six orbital elements); reference-vector tests.
3. `feat/true-scale-rendering`: true scale, log depth, camera-relative rendering, markers with labels and LOD, fly-to, touch controls, colored orbits.
4. `feat/backend-ephemeris`: Horizons fetcher and `/api/ephem`, plus the snapshot build step.
5. `feat/moons`: moons on sampled ephemerides with fallback to orbital elements.
6. `feat/small-bodies`: SBDB endpoint, named asteroids and comets (comet tails stay), GPU belts from real elements, NeoWs.
7. `feat/spacecraft`: Horizons spacecraft with mission windows and glTF models.
8. `feat/earth-satellites`: CelesTrak endpoint, curated list, SGP4, Earth-local view.
9. `feat/sky`: star catalog and constellation lines (replaces the `stars.jpg` skybox).
10. `feat/meteor-showers`: shower streams and active-now indicators.
11. `feat/textures-and-quality`: true-color texture set with attribution, KTX2 tiers, quality-tier detection, performance pass on real phones.
12. `feat/hud-polish`: search, legend, share URL, credits page.

## Data sources (agreed 2026-10-16)

Only one credential is used: `NASA_API_KEY`, kept in `backend/.env` locally, the Render environment in production, and GitHub Actions secrets for the snapshot job.

| Source | Key | Used for |
|---|---|---|
| JPL SSD APIs: Horizons, SBDB, SBDB query, CAD | none | moon/spacecraft state vectors; asteroid and comet elements; close approaches |
| api.nasa.gov NeoWs | NASA key | near-Earth objects, "passing this week" |
| api.nasa.gov APOD, EPIC; NASA GIBS | NASA key / none | existing imagery features |
| NASA Trek WMTS (Moon, Mars, Vesta) | none | high-resolution global surface maps for close-up views (global mosaics, not terrain streaming) |
| CelesTrak GP (OMM JSON) | none | Earth satellite element sets (primary) |
| NASA-listed TLE API | none | fallback for satellite element sets |
| NASA Image and Video Library | none | info-panel imagery |
| DONKI | NASA key | optional: current solar events on the Sun |
| SSCWeb | none | optional: Earth-orbiting science missions |
| NASA-3D-Resources (GitHub) | n/a | spacecraft glTF models |

Considered and rejected:
- **Google Earth Engine:** it needs a GCP project, OAuth and yearly re-verification, and GIBS already covers Earth imagery.
- **Space-Track:** it needs a login stored on the server, and its user agreement restricts redistribution.
- **N2YO:** it needs a key and caps calls per hour, and it returns positions rather than elements.
- **Copernicus/Sentinel Hub/openEO/Planet:** surface imagery is a non-goal.
- **Open Notify:** HTTP only; optional later, through the backend.

## Licensing and attribution

- Every third-party asset (textures, models, star and constellation data, libraries) gets an entry in a `CREDITS.md`, with its source and license, and appears in the in-app Credits.
- The current `frontend/public/textures/` files have **no recorded source**. Identify each one or replace it before the textures branch merges. If any are from Solar System Scope, they are CC BY 4.0 and must be credited.
- Prefer NASA/JPL/USGS public-domain imagery and NASA 3D Resources models. Following NASA's media guidelines, nothing may imply NASA endorsement, and the NASA logo is not used.
- The candidate star and constellation sources' licenses (e.g. HYG is CC BY-SA, d3-celestial data is BSD) must be checked before use. Share-alike data has to be kept in a separately licensed data file.

## Security

- The key stays server-side, and every outbound URL is built from allowlisted IDs, never from raw client input. Body-set names and object IDs are validated against fixed lists, which matters especially for Horizons `COMMAND` values.
- New endpoints get the same rate limiting, upstream budget, size caps and key-free logging.
- No `innerHTML` with fetched data. React escaping covers the HUD, and engine labels use text APIs only.
- Set a CSP on Vercel (default-src 'self', the backend origin, and only the NASA image hosts actually used).

## Left to the builder

- Exact HUD component structure and styling within the mockup's layout.
- How labels are rendered (WebGL vs capped DOM), as long as the budgets hold.
- The interpolation scheme and wire format for sampled ephemerides.
- The exact curated satellite and spacecraft lists. Seed suggestions:
  - satellites: ISS, Tiangong, Hubble, Landsat 8/9, Terra, Aqua, Sentinel-2A/B, GOES-East/West, NOAA-20, a few GPS satellites, Galileo, Iridium sample
  - spacecraft: JWST, Parker Solar Probe, Juno, Europa Clipper, Lucy, Psyche, Voyager 1/2, New Horizons, Perseverance/MRO at Mars, OSIRIS-APEX, Solar Orbiter, BepiColombo, JUICE
- Specific asteroid, comet and meteor-shower lists.
- Choice of state store and test tooling within the above.

## Calls made after the builder check (Claude's; Jeff may override)

- **Date range.** Date jump is clamped to 1900-01-01 – 2050-12-31.
  - Planets meet the 0.1° target across that whole range.
  - Ceres, Pluto, Eris, Haumea and Makemake use embedded SBDB osculating elements (the orbit as it is at one specific moment, its epoch). Their target is 1° within ±50 years of that epoch, and they are flagged "approximate" outside it.
  - Every object has an availability rule for a given time: the sample window, the mission coverage, or ±14 days from the satellite element epoch. Outside it, the object is hidden, or drawn from mean elements with an "approximate" flag. The info panel says which.
- **LIVE semantics.** LIVE means "displayed time = now at real rate". Separately, each object reports its data freshness. Stale data (past its availability rule) shows the "approximate" flag rather than silently degrading under the LIVE badge.
- **Routing.**
  - The browser calls `/api/*` on the Vercel origin, and a Vercel rewrite forwards it to Render. Benefits: one origin, edge caching via `Cache-Control`, CORS can be tightened, and a simple CSP `connect-src 'self'`.
  - Because requests then reach Render from Vercel, the builder must verify which header carries the real client IP on that path before setting `CLIENT_IP_HEADER`. Until then, the per-IP limit is relaxed and the global upstream budget is the main protection.
- **Branch flow.**
  - Jeff's "add them in different branches, commit, and push" is standing permission to push **feature branches**, never `main`.
  - When a branch depends on one that isn't merged yet, it is stacked on top of that branch, and its PR targets the parent branch. It gets rebased onto `main` after the parent merges.
  - Independent branches (e.g. `feat/backend-ephemeris` and `feat/sky`) may proceed in parallel.

## Answered by Jeff after the builder check

- **The compressed "visual scale" mode is dropped.** True scale is the only mode. `feat/ts-react-foundation` may remove the scale toggle instead of porting it, and no later branch carries a scale transform.
- **Snapshot freshness: a daily GitHub Action.**
  - A scheduled workflow fetches Horizons, SBDB, CelesTrak and NeoWs, regenerates the snapshot, and commits it to `main` as a bot. That triggers a Vercel redeploy.
  - The build itself makes no network calls. It bundles whatever snapshot is committed.
  - Hardening:
    - `NASA_API_KEY` lives in GitHub Actions secrets.
    - The workflow runs only on `schedule` and `workflow_dispatch` (never on `pull_request`), with `permissions: contents: write` and nothing else.
    - Third-party actions are pinned to commit SHAs.
    - The data commit touches only the snapshot directory, and is skipped when nothing changed.
    - The fetch script validates and size-caps every upstream response before writing.
  - Sample windows are sized so that a missed day or two never hides objects: at least ±30 days for moons and spacecraft.
  - The Render backend is still used to refresh data at runtime when it is awake.
  - Lives on branch `feat/backend-ephemeris`.
- **Test device: a mid-range Android phone.** Mobile budgets are tuned on it. At the end of every rendering-heavy branch, Jeff checks on the phone before merging.
