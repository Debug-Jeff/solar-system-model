import * as THREE from 'three'
import { textures } from './textures.js'
import { keplerianPosition, ellipsePoints } from './orbit.js'
import {
  planetVisualRadius,
  sunVisualRadius,
  moonVisualRadius,
  orbitVisualDistance,
  moonVisualDistance,
  planetTrueRadius,
  sunTrueRadius,
  moonTrueRadius,
  orbitTrueDistance,
  moonTrueDistance,
} from './data/scale.js'

// Shared unit-radius geometry: every sphere (planet, moon, cloud layer)
// is built at radius 1 and scaled per-instance. That makes the
// true-scale/visual-scale toggle a matter of changing mesh.scale rather
// than rebuilding geometry, and lets one geometry serve every body.
const SPHERE_GEOMETRY = new THREE.SphereGeometry(1, 64, 64)

// Scratch vectors reused across the comet-tail update every frame
// instead of allocating new ones per comet per frame.
const _tailWorldPos = new THREE.Vector3()
const _tailDir = new THREE.Vector3()
const ORIGIN = new THREE.Vector3(0, 0, 0)

// Ring inner/outer radii, in units of the parent planet's own radius —
// not real physical ratios we have data for, just visually reasonable
// approximations of Saturn's broad ring system and Uranus's narrow one.
const RING_SPANS = {
  saturn: { inner: 1.25, outer: 2.3 },
  uranus: { inner: 1.6, outer: 2.05 },
}

function clamp01(t) {
  return Math.min(1, Math.max(0, t))
}

// In true-scale mode a body's real radius (see data/scale.js) can be
// far smaller than a screen pixel at any usable camera distance — Earth
// is ~1/23,000th of its own orbit's radius. Rather than inflating the
// visible mesh to stay clickable (which is what broke true-scale
// proportions before), each body gets its own invisible hit-sphere,
// floored at a comfortable click radius independent of visual size.
const MIN_HIT_RADIUS = { planet: 0.45, moon: 0.18 }

function buildHitMesh() {
  const mesh = new THREE.Mesh(
    SPHERE_GEOMETRY,
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, depthTest: false })
  )
  return mesh
}

/**
 * Axial spin is deliberately NOT tied 1:1 to the same simulated clock
 * as orbital motion. A single physically-consistent time scale can't
 * serve both: compressing 60,195 simulated days (Neptune's year) into
 * a watchable session requires days to pass fast, but at that same
 * rate every ~24h rotation period would spin planets into a blur.
 *
 * Instead, real rotation periods are compressed (cube-root, like the
 * radius scale) into a fixed "simulated hours per rotation" band, so
 * relative spin speed order is preserved (Jupiter visibly spins faster
 * than Venus) without anything becoming unwatchable. Tune the band
 * below to taste — narrower spreads the gap less, wider makes slow
 * rotators (Venus, Uranus) more noticeably lazy.
 */
const SPIN_BAND_SIM_HOURS = { min: 300, max: 4000 }
const REAL_ROTATION_HOURS = { fastest: 9.93, slowest: 5832.5 } // Jupiter..Venus

function visualSpinRadPerSimHour(rotationPeriodHours) {
  const magnitude = Math.abs(rotationPeriodHours)
  const t = clamp01(
    (Math.cbrt(magnitude) - Math.cbrt(REAL_ROTATION_HOURS.fastest)) /
      (Math.cbrt(REAL_ROTATION_HOURS.slowest) - Math.cbrt(REAL_ROTATION_HOURS.fastest))
  )
  const periodSimHours =
    SPIN_BAND_SIM_HOURS.min + t * (SPIN_BAND_SIM_HOURS.max - SPIN_BAND_SIM_HOURS.min)
  const direction = rotationPeriodHours < 0 ? -1 : 1
  return (direction * (2 * Math.PI)) / periodSimHours
}

// Fixes the well-known RingGeometry UV bug: its default UVs are based on
// the ring's bounding box, which smears a texture unevenly across the
// band. Ring textures like these are a radial gradient (inner edge to
// outer edge), so every vertex's U should just be its normalized
// distance from the center.
function radialRingUVs(geometry, innerRadius, outerRadius) {
  const pos = geometry.attributes.position
  const uv = geometry.attributes.uv
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const distance = v.length()
    const u = clamp01((distance - innerRadius) / (outerRadius - innerRadius))
    uv.setXY(i, u, 1)
  }
  uv.needsUpdate = true
}

function buildRing(id, radiusMultiplier) {
  const span = RING_SPANS[id]
  const geometry = new THREE.RingGeometry(span.inner, span.outer, 96, 1)
  radialRingUVs(geometry, span.inner, span.outer)
  // Rings are given a strong emissive term rather than left as a purely
  // lit surface: a flat ring's face normal is nearly perpendicular to
  // the sunlight for most camera angles (anything but a steep raking
  // view), so a standard lit material collapses to near-black and the
  // ring appears to flicker in and out as the camera orbits. The
  // emissive map guarantees a visible base brightness from any angle,
  // while `map` still adds real shading on the sunlit side for depth.
  const material = new THREE.MeshStandardMaterial({
    map: textures[id].ring,
    emissiveMap: textures[id].ring,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.6,
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.05,
    roughness: 1,
    metalness: 0,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.rotation.x = -Math.PI / 2
  return { mesh, radiusMultiplier }
}

function buildMaterial(body) {
  const id = body.id
  if (id === 'sun') {
    return new THREE.MeshBasicMaterial({ map: textures.sun })
  }
  if (id === 'earth') {
    return new THREE.MeshPhongMaterial({
      map: textures.earth.day,
      normalMap: textures.earth.normal,
      specularMap: textures.earth.specular,
      specular: new THREE.Color(0x333333),
      shininess: 12,
      emissiveMap: textures.earth.night,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 1.1,
    })
  }
  if (id === 'venus') {
    // Venus's radar-mapped surface (venus_surface.jpg) is never actually
    // visible — real Venus, seen from outside, is just its unbroken
    // cloud deck, so the atmosphere texture is used as the only map.
    return new THREE.MeshStandardMaterial({ map: textures.venus.atmosphere, roughness: 1 })
  }
  if (id === 'moon') {
    return new THREE.MeshStandardMaterial({
      map: textures.moon.map,
      bumpMap: textures.moon.bump,
      bumpScale: 0.03,
      roughness: 1,
    })
  }
  if (id === 'saturn' || id === 'uranus') {
    return new THREE.MeshStandardMaterial({ map: textures[id].map, roughness: 1 })
  }
  if (textures[id]) {
    return new THREE.MeshStandardMaterial({ map: textures[id], roughness: 1 })
  }
  // No photographic texture available for this body (most moons, dwarf
  // planets and comets) — fall back to its flat reference color from
  // planets.json rather than rendering an untextured white sphere.
  // Comets get a base emissive glow since they're too small and dim to
  // pick up meaningful light from the Sun at their usual render scale.
  const color = new THREE.Color(body.color || '#999999')
  const params = { color, roughness: 1 }
  if (body.type === 'comet') {
    params.emissive = color
    params.emissiveIntensity = 0.5
  }
  return new THREE.MeshStandardMaterial(params)
}

function degToRad(deg) {
  return (deg * Math.PI) / 180
}

function radiusFor(body, trueScale, parentEntry) {
  if (body.type === 'star') return trueScale ? sunTrueRadius() : sunVisualRadius()
  if (body.type === 'moon') {
    return trueScale
      ? moonTrueRadius(body.radiusKm)
      : moonVisualRadius(body.radiusKm, parentEntry.currentRadius, parentEntry.data.radiusKm)
  }
  return trueScale ? planetTrueRadius(body.radiusKm) : planetVisualRadius(body.radiusKm)
}

function semiMajorAxisFor(body, trueScale, parentEntry) {
  if (body.type === 'moon') {
    return trueScale
      ? moonTrueDistance(body.distanceFromParentKm)
      : moonVisualDistance(body.distanceFromParentKm, parentEntry.currentRadius)
  }
  return trueScale ? orbitTrueDistance(body.distanceFromSunAU) : orbitVisualDistance(body.distanceFromSunAU)
}

// orbitVisualDistance adds a constant offset (distBase) before its sqrt
// compression — invisible for the near-circular planets it was designed
// for, but it badly distorts a real ellipse: naively treating its
// output as a "visual semi-major axis" and keeping the real eccentricity
// drags a high-e comet's perihelion inward by roughly (1-e) of that
// whole offset. For Encke (e=0.85) that pulls perihelion to ~6 units —
// inside the Sun's own 10-unit visual radius. Instead, perihelion and
// aphelion are each compressed independently in real AU, and the visual
// semi-major axis/eccentricity are re-derived from those two correct
// endpoints, so "close to the Sun" and "far from the Sun" stay correct
// even though the shape is no longer a literal scaled copy of reality.
function cometVisualOrbit(distanceFromSunAU, eccentricity) {
  const periAU = distanceFromSunAU * (1 - eccentricity)
  const apoAU = distanceFromSunAU * (1 + eccentricity)
  const periVisual = orbitVisualDistance(periAU)
  const apoVisual = orbitVisualDistance(apoAU)
  return {
    semiMajorAxis: (periVisual + apoVisual) / 2,
    eccentricity: (apoVisual - periVisual) / (apoVisual + periVisual),
  }
}

// Minimum extra clearance (beyond the two planets' own radii) enforced
// between adjacent display-scale orbits, in scene units.
const PLANET_ORBIT_CLEARANCE = 1.2

// Walks the real planets in distance order and pushes any orbit that's
// closer to its inner neighbor than their combined radii (plus a fixed
// clearance) outward until it isn't — cascading outward so a fix to one
// gap can't reopen the next one. Preserves relative order; never pulls
// anything inward, so it can only spread the inner planets out a bit.
function enforcePlanetOrbitSpacing(list) {
  const planets = list.filter((e) => e.type === 'planet').sort((a, b) => a.semiMajorAxis - b.semiMajorAxis)
  for (let i = 1; i < planets.length; i++) {
    const prev = planets[i - 1]
    const curr = planets[i]
    const minGap = prev.currentRadius + curr.currentRadius + PLANET_ORBIT_CLEARANCE
    const gap = curr.semiMajorAxis - prev.semiMajorAxis
    if (gap < minGap) curr.semiMajorAxis = prev.semiMajorAxis + minGap
  }
}

function rebuildOrbitLine(entry) {
  const points = ellipsePoints(entry.semiMajorAxis, entry.eccentricity)
  entry.orbitLine.geometry.dispose()
  entry.orbitLine.geometry = new THREE.BufferGeometry()
  entry.orbitLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  entry.orbitLine.computeLineDistances() // required for the dashed comet-orbit material to render dashes
}

// A comet's tail is really two things (dust and ion) both pushed
// straight away from the Sun by radiation/solar wind — never trailing
// behind its motion the way a jet contrail would. Modeled here as a
// simple particle stream anchored at the comet, stretched away from the
// Sun, with length driven by solar distance since real tails visibly
// grow near perihelion and all but disappear near aphelion.
const TAIL_PARTICLE_COUNT = 120

function buildCometTail(color) {
  const positions = new Float32Array(TAIL_PARTICLE_COUNT * 3)
  const along = new Float32Array(TAIL_PARTICLE_COUNT) // 0 (at nucleus) .. 1 (tail tip)
  for (let i = 0; i < TAIL_PARTICLE_COUNT; i++) along[i] = Math.random()
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({
    color: new THREE.Color(color || '#bcd6ff'),
    size: 0.3,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  points.userData.along = along
  return points
}

const TAIL_MIN_LENGTH = 0.6
const TAIL_MAX_LENGTH = 14
// Tuned so the tail is near TAIL_MAX_LENGTH at Mercury-ish distances and
// fades toward TAIL_MIN_LENGTH by the outer solar system — an inverse
// relationship echoing how solar heating (and outgassing) falls off
// with distance from the Sun.
const TAIL_LENGTH_K = 40

function updateCometTail(entry, sunWorldPos) {
  const worldPos = entry.pivot.getWorldPosition(_tailWorldPos)
  const distanceFromSun = worldPos.distanceTo(sunWorldPos)
  const awayFromSun = _tailDir.copy(worldPos).sub(sunWorldPos).normalize()
  const length = THREE.MathUtils.clamp(TAIL_LENGTH_K / Math.max(distanceFromSun, 0.01), TAIL_MIN_LENGTH, TAIL_MAX_LENGTH)

  const posAttr = entry.tailMesh.geometry.attributes.position
  const along = entry.tailMesh.userData.along
  for (let i = 0; i < along.length; i++) {
    const t = along[i]
    // Slight lateral spread that widens toward the tail tip, like a
    // real tail fanning out rather than staying pencil-thin.
    const spread = t * 0.35
    const jx = (Math.random() * 2 - 1) * spread
    const jy = (Math.random() * 2 - 1) * spread
    const jz = (Math.random() * 2 - 1) * spread
    posAttr.setXYZ(
      i,
      worldPos.x + awayFromSun.x * length * t + jx,
      worldPos.y + awayFromSun.y * length * t + jy,
      worldPos.z + awayFromSun.z * length * t + jz
    )
  }
  posAttr.needsUpdate = true
}

/**
 * Builds the full Three.js scene graph for every body in planets.json
 * and returns a small controller for driving it: per-frame updates,
 * the visual/true scale toggle, and lookup tables for raycasting and
 * label placement.
 */
export function createBodies(scene, planetsData, initialTrueScale) {
  const byId = new Map()
  const list = []
  const raycastTargets = []

  const orbitLineMaterial = new THREE.LineBasicMaterial({
    color: 0x4d6a99,
    transparent: true,
    opacity: 0.35,
  })

  // Comet orbits are wildly eccentric ellipses that would otherwise
  // clutter the view with a giant ring crossing half the solar system —
  // rendered thin and dashed to read as distinct from planet orbits,
  // and hidden until that comet is actually selected (see
  // setSelectedBody below) rather than shown by the blanket Orbits toggle.
  const cometOrbitLineMaterial = new THREE.LineDashedMaterial({
    color: 0x8fa0b8,
    dashSize: 1.4,
    gapSize: 1,
    transparent: true,
    opacity: 0.55,
  })

  function makeEntry(body, parentEntry, index) {
    const parentGroup = parentEntry ? parentEntry.tiltGroup : scene

    // Planets/moons are kept in a shared flat plane (inclination ~0-7°
    // isn't worth the complexity here), but comets have wildly tilted,
    // often retrograde orbits (Halley: 162°) that are a big part of what
    // makes them read as comets rather than stray planets. orbitFrame
    // tilts the whole orbit — the ellipse line and the body's pivot —
    // out of that shared plane by the body's real inclination.
    const orbitFrame = new THREE.Object3D()
    orbitFrame.rotation.z = degToRad(body.orbitalInclinationDeg || 0)
    parentGroup.add(orbitFrame)

    const pivot = new THREE.Object3D()
    orbitFrame.add(pivot)

    const tiltGroup = new THREE.Object3D()
    tiltGroup.rotation.z = degToRad(body.axialTiltDeg || 0)
    pivot.add(tiltGroup)

    const mesh = new THREE.Mesh(SPHERE_GEOMETRY, buildMaterial(body))
    tiltGroup.add(mesh)

    const hitMesh = buildHitMesh()
    hitMesh.userData.bodyId = body.id
    tiltGroup.add(hitMesh)
    raycastTargets.push(hitMesh)

    const extraMeshes = []
    if (body.id === 'earth') {
      const clouds = new THREE.Mesh(
        SPHERE_GEOMETRY,
        new THREE.MeshStandardMaterial({
          alphaMap: textures.earth.clouds,
          color: 0xffffff,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          roughness: 1,
        })
      )
      tiltGroup.add(clouds)
      extraMeshes.push({ mesh: clouds, radiusMultiplier: 1.015, spinFactor: 1.15 })
    }
    if (RING_SPANS[body.id]) {
      const ring = buildRing(body.id, 1)
      tiltGroup.add(ring.mesh)
      extraMeshes.push({ mesh: ring.mesh, radiusMultiplier: 1, spinFactor: 0 })
    }

    let orbitLine = null
    if (body.type !== 'star') {
      const isComet = body.type === 'comet'
      orbitLine = new THREE.Line(
        new THREE.BufferGeometry(),
        isComet ? cometOrbitLineMaterial : orbitLineMaterial
      )
      orbitLine.visible = !isComet
      orbitFrame.add(orbitLine)
    }

    const tailMesh = body.type === 'comet' ? buildCometTail(body.color) : null
    if (tailMesh) scene.add(tailMesh)

    const entry = {
      id: body.id,
      data: body,
      type: body.type,
      parentId: parentEntry ? parentEntry.id : null,
      pivot,
      tiltGroup,
      mesh,
      hitMesh,
      extraMeshes,
      orbitLine,
      tailMesh,
      theta: index * 1.35, // spread starting positions so bodies don't all line up
      eccentricity: body.orbitalEccentricity || 0,
      angularSpeedPerSimHour:
        body.type === 'star'
          ? 0
          : ((body.retrograde ? -1 : 1) * (2 * Math.PI)) / (body.orbitalPeriodDays * 24),
      spinRadPerSimHour: visualSpinRadPerSimHour(body.rotationPeriodHours || 1),
      currentRadius: 1,
      semiMajorAxis: 0,
    }

    byId.set(body.id, entry)
    list.push(entry)
    return entry
  }

  const sun = planetsData.find((b) => b.type === 'star')
  // Dwarf planets and comets orbit the Sun directly just like planets do,
  // and share the same radius/distance formulas (see radiusFor/
  // semiMajorAxisFor's default branch), so they're built the same way.
  const planets = planetsData.filter((b) => b.type === 'planet' || b.type === 'dwarfPlanet' || b.type === 'comet')
  const moons = planetsData.filter((b) => b.type === 'moon')

  makeEntry(sun, null, 0)
  planets.forEach((body, i) => makeEntry(body, null, i + 1))
  moons.forEach((body, i) => makeEntry(body, byId.get(body.parent), i + 1))

  function applyScale(trueScale) {
    // Star and planets first: moons depend on their parent's freshly
    // computed currentRadius (moonVisualRadius/-Distance take it as an
    // input), so parents must be resolved before their moons are.
    for (const entry of list) {
      if (entry.type === 'moon') continue
      const radius = radiusFor(entry.data, trueScale, null)
      entry.currentRadius = radius
      entry.mesh.scale.setScalar(radius)
      entry.hitMesh.scale.setScalar(Math.max(radius, MIN_HIT_RADIUS.planet))
      for (const extra of entry.extraMeshes) {
        extra.mesh.scale.setScalar(radius * extra.radiusMultiplier)
      }
      if (entry.type !== 'star') {
        entry.semiMajorAxis = semiMajorAxisFor(entry.data, trueScale, null)
        entry.eccentricity = entry.data.orbitalEccentricity || 0
        if (!trueScale && entry.type === 'comet') {
          const orbit = cometVisualOrbit(entry.data.distanceFromSunAU, entry.eccentricity)
          entry.semiMajorAxis = orbit.semiMajorAxis
          entry.eccentricity = orbit.eccentricity
        }
      }
    }
    // Display-scale distances are sqrt-compressed to fit the whole
    // system in view, but planet radii are only cube-root-compressed —
    // those two compressions run at different rates, so the inner
    // rocky planets (bunched closest together in AU terms) can end up
    // with less orbital gap than their combined radii need, and clip
    // into each other. True scale has no such artificial compression
    // mismatch (both distance and radius are literal), so this only
    // applies to display scale, and only to the real planets — comets
    // and dwarf planets keep their raw positions.
    if (!trueScale) enforcePlanetOrbitSpacing(list)
    for (const entry of list) {
      if (entry.type === 'moon' || entry.type === 'star') continue
      rebuildOrbitLine(entry)
    }
    for (const entry of list) {
      if (entry.type !== 'moon') continue
      const parentEntry = byId.get(entry.parentId)
      const radius = radiusFor(entry.data, trueScale, parentEntry)
      entry.currentRadius = radius
      entry.mesh.scale.setScalar(radius)
      entry.hitMesh.scale.setScalar(Math.max(radius, MIN_HIT_RADIUS.moon))
      entry.semiMajorAxis = semiMajorAxisFor(entry.data, trueScale, parentEntry)
      rebuildOrbitLine(entry)
    }
    // Positions were computed against the old semiMajorAxis; snap them
    // to the new orbit immediately rather than waiting for next frame.
    updateFrame(0)
  }

  function updateFrame(deltaSimHours) {
    for (const entry of list) {
      if (entry.type !== 'star') {
        entry.theta += entry.angularSpeedPerSimHour * deltaSimHours
        const { x, z } = keplerianPosition(entry.theta, entry.semiMajorAxis, entry.eccentricity)
        entry.pivot.position.set(x, 0, z)
      }
      entry.mesh.rotation.y += entry.spinRadPerSimHour * deltaSimHours
      for (const extra of entry.extraMeshes) {
        if (extra.spinFactor) extra.mesh.rotation.y += entry.spinRadPerSimHour * extra.spinFactor * deltaSimHours
      }
      // The Sun never itself translates in this model, so its world
      // position is always the origin — no need to look its entry up.
      if (entry.tailMesh) updateCometTail(entry, ORIGIN)
    }
  }

  applyScale(initialTrueScale)

  // The blanket Orbits toggle only affects planets/moons — comet orbits
  // are selection-driven instead (see setSelectedBody) since showing a
  // comet's full, giant, wildly-tilted ellipse by default would clutter
  // the view far more than it would inform.
  function setOrbitsVisible(visible) {
    for (const entry of list) {
      if (entry.orbitLine && entry.type !== 'comet') entry.orbitLine.visible = visible
    }
  }

  function setSelectedBody(bodyId) {
    for (const entry of list) {
      if (entry.type === 'comet' && entry.orbitLine) entry.orbitLine.visible = entry.id === bodyId
    }
  }

  return {
    list,
    byId,
    raycastTargets,
    earthMaterial: byId.get('earth').mesh.material,
    updateFrame,
    setTrueScale: applyScale,
    setOrbitsVisible,
    setSelectedBody,
  }
}
