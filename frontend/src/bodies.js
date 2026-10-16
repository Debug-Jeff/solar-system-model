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

const SPHERE_GEOMETRY = new THREE.SphereGeometry(1, 64, 64)

const _tailWorldPos = new THREE.Vector3()
const _tailDir = new THREE.Vector3()
const ORIGIN = new THREE.Vector3(0, 0, 0)

const RING_SPANS = {
  saturn: { inner: 1.25, outer: 2.3 },
  uranus: { inner: 1.6, outer: 2.05 },
}

function clamp01(t) {
  return Math.min(1, Math.max(0, t))
}

const MIN_HIT_RADIUS = { planet: 0.45, moon: 0.18 }

function buildHitMesh() {
  const mesh = new THREE.Mesh(
    SPHERE_GEOMETRY,
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, depthTest: false })
  )
  return mesh
}

const SPIN_BAND_SIM_HOURS = { min: 300, max: 4000 }
const REAL_ROTATION_HOURS = { fastest: 9.93, slowest: 5832.5 }

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

const PLANET_ORBIT_CLEARANCE = 1.2

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
  entry.orbitLine.computeLineDistances()
}

const TAIL_PARTICLE_COUNT = 120

function buildCometTail(color) {
  const positions = new Float32Array(TAIL_PARTICLE_COUNT * 3)
  const along = new Float32Array(TAIL_PARTICLE_COUNT)
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

export function createBodies(scene, planetsData, initialTrueScale) {
  const byId = new Map()
  const list = []
  const raycastTargets = []

  const orbitLineMaterial = new THREE.LineBasicMaterial({
    color: 0x4d6a99,
    transparent: true,
    opacity: 0.35,
  })

  const cometOrbitLineMaterial = new THREE.LineDashedMaterial({
    color: 0x8fa0b8,
    dashSize: 1.4,
    gapSize: 1,
    transparent: true,
    opacity: 0.55,
  })

  function makeEntry(body, parentEntry, index) {
    const parentGroup = parentEntry ? parentEntry.tiltGroup : scene

    const orbitFrame = new THREE.Object3D()
    orbitFrame.rotation.order = 'YXZ'
    orbitFrame.rotation.y = degToRad((index * 137.508) % 360)
    orbitFrame.rotation.x = degToRad(body.orbitalInclinationDeg || 0)
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
      theta: index * 1.35,
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
  const planets = planetsData.filter((b) => b.type === 'planet' || b.type === 'dwarfPlanet' || b.type === 'comet')
  const moons = planetsData.filter((b) => b.type === 'moon')

  makeEntry(sun, null, 0)
  planets.forEach((body, i) => makeEntry(body, null, i + 1))
  moons.forEach((body, i) => makeEntry(body, byId.get(body.parent), i + 1))

  function applyScale(trueScale) {
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
      if (entry.tailMesh) updateCometTail(entry, ORIGIN)
    }
  }

  applyScale(initialTrueScale)

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
