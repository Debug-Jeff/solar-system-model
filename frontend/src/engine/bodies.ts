import * as THREE from 'three'
import type { Body, BodyType } from '../types/body'
import { ellipsePoints, keplerianPosition } from './orbit'
import { moonVisualDistance, moonVisualRadius, orbitVisualDistance, planetVisualRadius, sunVisualRadius } from './scale'
import type { Textures } from './textures'

const SPHERE_GEOMETRY = new THREE.SphereGeometry(1, 64, 64)
const ORIGIN = new THREE.Vector3(0, 0, 0)
const _tailWorldPos = new THREE.Vector3()
const _tailDir = new THREE.Vector3()

type RingedId = 'saturn' | 'uranus'
const RING_SPANS: Record<RingedId, { inner: number; outer: number }> = {
  saturn: { inner: 1.25, outer: 2.3 },
  uranus: { inner: 1.6, outer: 2.05 },
}

function isRinged(id: string): id is RingedId {
  return id === 'saturn' || id === 'uranus'
}

const MIN_HIT_RADIUS = { planet: 0.45, moon: 0.18 }
const SPIN_BAND_SIM_HOURS = { min: 300, max: 4000 }
const REAL_ROTATION_HOURS = { fastest: 9.93, slowest: 5832.5 }
const PLANET_ORBIT_CLEARANCE = 1.2
const TAIL_PARTICLE_COUNT = 120
const TAIL_MIN_LENGTH = 0.6
const TAIL_MAX_LENGTH = 14
const TAIL_LENGTH_K = 40

export interface ExtraMesh {
  mesh: THREE.Mesh
  radiusMultiplier: number
  spinFactor: number
}

export interface BodyEntry {
  id: string
  data: Body
  type: BodyType
  parentId: string | null
  pivot: THREE.Object3D
  tiltGroup: THREE.Object3D
  mesh: THREE.Mesh
  hitMesh: THREE.Mesh
  extraMeshes: ExtraMesh[]
  orbitLine: THREE.Line | null
  tailMesh: THREE.Points | null
  theta: number
  initialTheta: number
  eccentricity: number
  angularSpeedPerSimHour: number
  spinRadPerSimHour: number
  currentRadius: number
  semiMajorAxis: number
}

export interface Bodies {
  list: BodyEntry[]
  byId: Map<string, BodyEntry>
  raycastTargets: THREE.Mesh[]
  earthMaterial: THREE.MeshPhongMaterial
  updateFrame(deltaSimHours: number): void
  snapToTime(elapsedSimHours: number): void
  setOrbitsVisible(visible: boolean): void
  setSelectedBody(bodyId: string | null): void
  getBodyWorldPos(bodyId: string, target: THREE.Vector3): THREE.Vector3
}

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t))
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

function visualSpinRadPerSimHour(rotationPeriodHours: number): number {
  const magnitude = Math.abs(rotationPeriodHours)
  const t = clamp01(
    (Math.cbrt(magnitude) - Math.cbrt(REAL_ROTATION_HOURS.fastest)) /
      (Math.cbrt(REAL_ROTATION_HOURS.slowest) - Math.cbrt(REAL_ROTATION_HOURS.fastest))
  )
  const periodSimHours = SPIN_BAND_SIM_HOURS.min + t * (SPIN_BAND_SIM_HOURS.max - SPIN_BAND_SIM_HOURS.min)
  const direction = rotationPeriodHours < 0 ? -1 : 1
  return (direction * (2 * Math.PI)) / periodSimHours
}

function buildHitMesh(): THREE.Mesh {
  return new THREE.Mesh(
    SPHERE_GEOMETRY,
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, depthTest: false })
  )
}

function radialRingUVs(geometry: THREE.RingGeometry, innerRadius: number, outerRadius: number): void {
  const pos = geometry.getAttribute('position')
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    uv.setXY(i, clamp01((v.length() - innerRadius) / (outerRadius - innerRadius)), 1)
  }
  uv.needsUpdate = true
}

function buildRing(id: RingedId, textures: Textures): THREE.Mesh {
  const span = RING_SPANS[id]
  const geometry = new THREE.RingGeometry(span.inner, span.outer, 96, 1)
  radialRingUVs(geometry, span.inner, span.outer)
  const ring = textures[id].ring
  const material = new THREE.MeshStandardMaterial({
    map: ring,
    emissiveMap: ring,
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
  return mesh
}

function buildMaterial(body: Body, textures: Textures): THREE.Material {
  const plainMaps: Partial<Record<string, THREE.Texture>> = {
    mercury: textures.mercury,
    mars: textures.mars,
    jupiter: textures.jupiter,
    neptune: textures.neptune,
  }
  switch (body.id) {
    case 'sun':
      return new THREE.MeshBasicMaterial({ map: textures.sun })
    case 'earth':
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
    case 'venus':
      return new THREE.MeshStandardMaterial({ map: textures.venus.atmosphere, roughness: 1 })
    case 'moon':
      return new THREE.MeshStandardMaterial({
        map: textures.moon.map,
        bumpMap: textures.moon.bump,
        bumpScale: 0.03,
        roughness: 1,
      })
    case 'saturn':
    case 'uranus':
      return new THREE.MeshStandardMaterial({ map: textures[body.id].map, roughness: 1 })
  }
  const plain = plainMaps[body.id]
  if (plain) return new THREE.MeshStandardMaterial({ map: plain, roughness: 1 })
  const color = new THREE.Color(body.color || '#999999')
  const params: THREE.MeshStandardMaterialParameters = { color, roughness: 1 }
  if (body.type === 'comet') {
    params.emissive = color
    params.emissiveIntensity = 0.5
  }
  return new THREE.MeshStandardMaterial(params)
}

function radiusFor(body: Body, parent: BodyEntry | null): number {
  if (body.type === 'star') return sunVisualRadius()
  if (body.type === 'moon' && parent) return moonVisualRadius(body.radiusKm, parent.currentRadius, parent.data.radiusKm)
  return planetVisualRadius(body.radiusKm)
}

function semiMajorAxisFor(body: Body, parent: BodyEntry | null): number {
  if (body.type === 'moon' && parent) return moonVisualDistance(body.distanceFromParentKm ?? 0, parent.currentRadius)
  return orbitVisualDistance(body.distanceFromSunAU ?? 0)
}

function cometVisualOrbit(distanceFromSunAU: number, eccentricity: number) {
  const periVisual = orbitVisualDistance(distanceFromSunAU * (1 - eccentricity))
  const apoVisual = orbitVisualDistance(distanceFromSunAU * (1 + eccentricity))
  return {
    semiMajorAxis: (periVisual + apoVisual) / 2,
    eccentricity: (apoVisual - periVisual) / (apoVisual + periVisual),
  }
}

function enforcePlanetOrbitSpacing(list: BodyEntry[]): void {
  const planets = list.filter((e) => e.type === 'planet').sort((a, b) => a.semiMajorAxis - b.semiMajorAxis)
  for (let i = 1; i < planets.length; i++) {
    const prev = planets[i - 1]!
    const curr = planets[i]!
    const minGap = prev.currentRadius + curr.currentRadius + PLANET_ORBIT_CLEARANCE
    if (curr.semiMajorAxis - prev.semiMajorAxis < minGap) curr.semiMajorAxis = prev.semiMajorAxis + minGap
  }
}

function rebuildOrbitLine(entry: BodyEntry): void {
  if (!entry.orbitLine) return
  entry.orbitLine.geometry.dispose()
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(ellipsePoints(entry.semiMajorAxis, entry.eccentricity), 3))
  entry.orbitLine.geometry = geometry
  entry.orbitLine.computeLineDistances()
}

function buildCometTail(color: string | undefined): THREE.Points {
  const along = new Float32Array(TAIL_PARTICLE_COUNT)
  for (let i = 0; i < TAIL_PARTICLE_COUNT; i++) along[i] = Math.random()
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TAIL_PARTICLE_COUNT * 3), 3))
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

function updateCometTail(entry: BodyEntry, sunWorldPos: THREE.Vector3): void {
  if (!entry.tailMesh) return
  const worldPos = entry.pivot.getWorldPosition(_tailWorldPos)
  const distanceFromSun = worldPos.distanceTo(sunWorldPos)
  const awayFromSun = _tailDir.copy(worldPos).sub(sunWorldPos).normalize()
  const length = THREE.MathUtils.clamp(TAIL_LENGTH_K / Math.max(distanceFromSun, 0.01), TAIL_MIN_LENGTH, TAIL_MAX_LENGTH)
  const posAttr = entry.tailMesh.geometry.getAttribute('position') as THREE.BufferAttribute
  const along = entry.tailMesh.userData.along as Float32Array
  for (let i = 0; i < along.length; i++) {
    const t = along[i]!
    const spread = t * 0.35
    posAttr.setXYZ(
      i,
      worldPos.x + awayFromSun.x * length * t + (Math.random() * 2 - 1) * spread,
      worldPos.y + awayFromSun.y * length * t + (Math.random() * 2 - 1) * spread,
      worldPos.z + awayFromSun.z * length * t + (Math.random() * 2 - 1) * spread
    )
  }
  posAttr.needsUpdate = true
}

export function createBodies(scene: THREE.Scene, planetsData: Body[], textures: Textures): Bodies {
  const byId = new Map<string, BodyEntry>()
  const list: BodyEntry[] = []
  const raycastTargets: THREE.Mesh[] = []

  const orbitLineMaterial = new THREE.LineBasicMaterial({ color: 0x4d6a99, transparent: true, opacity: 0.35 })
  const cometOrbitLineMaterial = new THREE.LineDashedMaterial({
    color: 0x8fa0b8,
    dashSize: 1.4,
    gapSize: 1,
    transparent: true,
    opacity: 0.55,
  })

  function makeEntry(body: Body, parentEntry: BodyEntry | null, index: number): BodyEntry {
    const parentGroup: THREE.Object3D = parentEntry ? parentEntry.pivot : scene

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

    const mesh = new THREE.Mesh(SPHERE_GEOMETRY, buildMaterial(body, textures))
    tiltGroup.add(mesh)

    const hitMesh = buildHitMesh()
    hitMesh.userData.bodyId = body.id
    tiltGroup.add(hitMesh)
    raycastTargets.push(hitMesh)

    const extraMeshes: ExtraMesh[] = []
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
    if (isRinged(body.id)) {
      const ring = buildRing(body.id, textures)
      tiltGroup.add(ring)
      extraMeshes.push({ mesh: ring, radiusMultiplier: 1, spinFactor: 0 })
    }

    let orbitLine: THREE.Line | null = null
    if (body.type !== 'star') {
      const isComet = body.type === 'comet'
      orbitLine = new THREE.Line(new THREE.BufferGeometry(), isComet ? cometOrbitLineMaterial : orbitLineMaterial)
      orbitLine.visible = !isComet
      orbitFrame.add(orbitLine)
    }

    const tailMesh = body.type === 'comet' ? buildCometTail(body.color) : null
    if (tailMesh) scene.add(tailMesh)

    const entry: BodyEntry = {
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
      initialTheta: index * 1.35,
      eccentricity: body.orbitalEccentricity || 0,
      angularSpeedPerSimHour:
        body.type === 'star' ? 0 : ((body.retrograde ? -1 : 1) * (2 * Math.PI)) / (body.orbitalPeriodDays * 24),
      spinRadPerSimHour: visualSpinRadPerSimHour(body.rotationPeriodHours || 1),
      currentRadius: 1,
      semiMajorAxis: 0,
    }

    byId.set(body.id, entry)
    list.push(entry)
    return entry
  }

  const sun = planetsData.find((b) => b.type === 'star')
  if (!sun) throw new Error('planet data has no star')
  const primaries = planetsData.filter((b) => b.type === 'planet' || b.type === 'dwarfPlanet' || b.type === 'comet')
  const moons = planetsData.filter((b) => b.type === 'moon')

  makeEntry(sun, null, 0)
  primaries.forEach((body, i) => makeEntry(body, null, i + 1))
  moons.forEach((body, i) => {
    const parent = body.parent ? byId.get(body.parent) : undefined
    if (parent) makeEntry(body, parent, i + 1)
  })

  function placeAt(entry: BodyEntry): void {
    const { x, z } = keplerianPosition(entry.theta, entry.semiMajorAxis, entry.eccentricity)
    entry.pivot.position.set(x, 0, z)
  }

  function layout(): void {
    for (const entry of list) {
      if (entry.type === 'moon') continue
      const radius = radiusFor(entry.data, null)
      entry.currentRadius = radius
      entry.mesh.scale.setScalar(radius)
      entry.hitMesh.scale.setScalar(Math.max(radius, MIN_HIT_RADIUS.planet))
      for (const extra of entry.extraMeshes) extra.mesh.scale.setScalar(radius * extra.radiusMultiplier)
      if (entry.type === 'star') continue
      entry.semiMajorAxis = semiMajorAxisFor(entry.data, null)
      entry.eccentricity = entry.data.orbitalEccentricity || 0
      if (entry.type === 'comet') {
        const orbit = cometVisualOrbit(entry.data.distanceFromSunAU ?? 0, entry.eccentricity)
        entry.semiMajorAxis = orbit.semiMajorAxis
        entry.eccentricity = orbit.eccentricity
      }
    }
    enforcePlanetOrbitSpacing(list)
    for (const entry of list) {
      if (entry.type !== 'moon' && entry.type !== 'star') rebuildOrbitLine(entry)
    }
    for (const entry of list) {
      if (entry.type !== 'moon') continue
      const parent = entry.parentId ? (byId.get(entry.parentId) ?? null) : null
      const radius = radiusFor(entry.data, parent)
      entry.currentRadius = radius
      entry.mesh.scale.setScalar(radius)
      entry.hitMesh.scale.setScalar(Math.max(radius, MIN_HIT_RADIUS.moon))
      entry.semiMajorAxis = semiMajorAxisFor(entry.data, parent)
      rebuildOrbitLine(entry)
    }
  }

  function updateFrame(deltaSimHours: number): void {
    for (const entry of list) {
      if (entry.type !== 'star') {
        entry.theta += entry.angularSpeedPerSimHour * deltaSimHours
        placeAt(entry)
      }
      entry.mesh.rotation.y += entry.spinRadPerSimHour * deltaSimHours
      for (const extra of entry.extraMeshes) {
        if (extra.spinFactor) extra.mesh.rotation.y += entry.spinRadPerSimHour * extra.spinFactor * deltaSimHours
      }
      updateCometTail(entry, ORIGIN)
    }
  }

  function snapToTime(elapsedSimHours: number): void {
    for (const entry of list) {
      if (entry.type === 'star') continue
      entry.theta = entry.initialTheta + entry.angularSpeedPerSimHour * elapsedSimHours
      placeAt(entry)
      updateCometTail(entry, ORIGIN)
    }
  }

  layout()
  updateFrame(0)

  const earth = byId.get('earth')
  if (!earth || !(earth.mesh.material instanceof THREE.MeshPhongMaterial)) throw new Error('planet data has no earth')

  return {
    list,
    byId,
    raycastTargets,
    earthMaterial: earth.mesh.material,
    updateFrame,
    snapToTime,
    setOrbitsVisible(visible) {
      for (const entry of list) {
        if (entry.orbitLine && entry.type !== 'comet') entry.orbitLine.visible = visible
      }
    },
    setSelectedBody(bodyId) {
      for (const entry of list) {
        if (entry.type === 'comet' && entry.orbitLine) entry.orbitLine.visible = entry.id === bodyId
      }
    },
    getBodyWorldPos(bodyId, target) {
      const entry = byId.get(bodyId)
      if (!entry) return target.set(0, 0, 0)
      return entry.mesh.getWorldPosition(target)
    },
  }
}
