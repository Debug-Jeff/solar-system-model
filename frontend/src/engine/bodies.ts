import * as THREE from 'three'
import { hasEphemeris, heliocentricEcliptic, orbitPath, type EphemerisId } from '../ephemeris'
import type { Body, BodyType } from '../types/body'
import { moonOrbitPath, moonPosition, moonSetFor, onSetRegistered, trackCoverage } from '../ephemeris/moonStore'
import { eclipticKmToScene, eclipticKmVecToScene } from './frames'
import { keplerianPosition, ellipsePoints } from './orbit'
import { ORBIT_OPACITY, orbitColor, relativePositions } from './orbitStyle'
import { moonVisible, type MarkerEntry } from './markers'
import { insertOnPath } from './pathFix'
import { projectedRadiusPx } from './projection'
import type { Textures } from './textures'

const SPHERE_GEOMETRY = new THREE.SphereGeometry(1, 64, 64)
const SUN_RADIUS_KM = 696_340
const J2000_MS = Date.UTC(2000, 0, 1, 12)
const MS_PER_HOUR = 3_600_000
const ORBIT_REBUILD_MS = 25 * 365.25 * 86_400_000
const ORBIT_LOCAL_FRACTION = 0.02
const TAIL_PARTICLE_COUNT = 160
const TAIL_K_KM = 2e7
const TAIL_MIN_KM = 2e5
const TAIL_MAX_KM = 6e7
const COMET_DASH_KM = 5e6
const COMET_GAP_KM = 3e6

const _tailDir = new THREE.Vector3()
const _worldPos = new THREE.Vector3()
const _parentPos = new THREE.Vector3()

type RingedId = 'saturn' | 'uranus'
const RING_SPANS: Record<RingedId, { inner: number; outer: number }> = {
  saturn: { inner: 1.25, outer: 2.3 },
  uranus: { inner: 1.6, outer: 2.05 },
}

function isRinged(id: string): id is RingedId {
  return id === 'saturn' || id === 'uranus'
}

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
  ephemerisId: EphemerisId | null
  pivot: THREE.Object3D
  orbitFrame: THREE.Object3D
  baseFrameRotation: THREE.Euler
  trackActive: boolean
  mesh: THREE.Mesh
  extraMeshes: ExtraMesh[]
  orbitLine: THREE.Line | null
  orbitMaterial: THREE.LineBasicMaterial | null
  orbitBaseOpacity: number
  orbitColor: string
  orbitPoints: THREE.Vector3[]
  orbitOrigin: THREE.Vector3
  orbitBuiltAtMs: number
  tailMesh: THREE.Points | null
  initialTheta: number
  angularSpeedPerSimHour: number
  spinRadPerSimHour: number
  radiusKm: number
  semiMajorAxisKm: number
  eccentricity: number
}

export interface MoonSystem {
  planetId: string
  set: string
  memberIds: string[]
  outerOrbitKm: number
}

export interface Bodies {
  list: BodyEntry[]
  byId: Map<string, BodyEntry>
  raycastTargets: THREE.Mesh[]
  markerEntries: MarkerEntry[]
  earthMaterial: THREE.MeshPhongMaterial
  updateFrame(simTimeMs: number, deltaSimHours: number): void
  updateView(camera: THREE.PerspectiveCamera, viewportHeight: number, selectedId: string | null, orbitsOn: boolean): void
  moonSystems: MoonSystem[]
  dispose(): void
  getBodyWorldPos(bodyId: string, target: THREE.Vector3): THREE.Vector3
}

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t))
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

function spinRadPerSimHour(rotationPeriodHours: number): number {
  if (!Number.isFinite(rotationPeriodHours) || rotationPeriodHours === 0) return 0
  return (2 * Math.PI) / rotationPeriodHours
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
  const geometry = new THREE.RingGeometry(span.inner, span.outer, 128, 1)
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

const BUS_GEOMETRY = new THREE.BoxGeometry(1, 0.7, 0.7)
const PANEL_GEOMETRY = new THREE.PlaneGeometry(1.6, 0.6)

function buildSpacecraftMesh(): THREE.Mesh {
  const bus = new THREE.Mesh(BUS_GEOMETRY, new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.3, roughness: 0.45 }))
  const panelMaterial = new THREE.MeshStandardMaterial({ color: 0x1d3c78, metalness: 0.4, roughness: 0.5, side: THREE.DoubleSide })
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(PANEL_GEOMETRY, panelMaterial)
    panel.position.x = side * 1.35
    panel.rotation.x = -Math.PI / 2
    bus.add(panel)
  }
  return bus
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

function buildCometTail(color: string | undefined): THREE.Points {
  const along = new Float32Array(TAIL_PARTICLE_COUNT)
  for (let i = 0; i < TAIL_PARTICLE_COUNT; i++) along[i] = Math.random()
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TAIL_PARTICLE_COUNT * 3), 3))
  const material = new THREE.PointsMaterial({
    color: new THREE.Color(color || '#bcd6ff'),
    size: 2,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  points.userData.along = along
  return points
}

function updateCometTail(entry: BodyEntry): void {
  if (!entry.tailMesh) return
  const worldPos = entry.pivot.getWorldPosition(_worldPos)
  const distanceAU = worldPos.length() / 149_597_870.7
  const length = THREE.MathUtils.clamp(TAIL_K_KM / Math.max(distanceAU * distanceAU, 1e-6), TAIL_MIN_KM, TAIL_MAX_KM)
  _tailDir.copy(worldPos).normalize()
  entry.tailMesh.position.copy(worldPos)
  const posAttr = entry.tailMesh.geometry.getAttribute('position') as THREE.BufferAttribute
  const along = entry.tailMesh.userData.along as Float32Array
  for (let i = 0; i < along.length; i++) {
    const t = along[i]!
    const spread = t * length * 0.04
    posAttr.setXYZ(
      i,
      _tailDir.x * length * t + (Math.random() * 2 - 1) * spread,
      _tailDir.y * length * t + (Math.random() * 2 - 1) * spread,
      _tailDir.z * length * t + (Math.random() * 2 - 1) * spread
    )
  }
  posAttr.needsUpdate = true
}

function writeOrbitBuffer(entry: BodyEntry, origin: THREE.Vector3, points: readonly THREE.Vector3[] = entry.orbitPoints): void {
  if (!entry.orbitLine) return
  entry.orbitOrigin.copy(origin)
  entry.orbitLine.position.copy(origin)
  const array = relativePositions(points, origin)
  const attr = entry.orbitLine.geometry.getAttribute('position') as THREE.BufferAttribute | undefined
  if (attr && attr.array.length === array.length) {
    ;(attr.array as Float32Array).set(array)
    attr.needsUpdate = true
  } else {
    entry.orbitLine.geometry.setAttribute('position', new THREE.BufferAttribute(array, 3))
  }
  entry.orbitLine.geometry.computeBoundingSphere()
  if (entry.type === 'comet') entry.orbitLine.computeLineDistances()
}

function rebuildOrbit(entry: BodyEntry, simTimeMs: number): void {
  if (entry.ephemerisId) {
    entry.orbitPoints = orbitPath(entry.ephemerisId, simTimeMs).map((v) => eclipticKmToScene(v, new THREE.Vector3()))
    entry.orbitBuiltAtMs = simTimeMs
  } else {
    const flat = ellipsePoints(entry.semiMajorAxisKm, entry.eccentricity)
    const points: THREE.Vector3[] = []
    for (let i = 0; i < flat.length; i += 3) points.push(new THREE.Vector3(flat[i], flat[i + 1], flat[i + 2]))
    entry.orbitPoints = points
  }
  writeOrbitBuffer(entry, entry.ephemerisId ? new THREE.Vector3() : entry.orbitOrigin.set(0, 0, 0))
}

export function createBodies(scene: THREE.Scene, planetsData: Body[], textures: Textures, initialSimTimeMs: number): Bodies {
  const byId = new Map<string, BodyEntry>()
  const list: BodyEntry[] = []
  const raycastTargets: THREE.Mesh[] = []
  const markerEntries: MarkerEntry[] = []
  const bodyById = new Map(planetsData.map((b) => [b.id, b]))

  function makeEntry(body: Body, parentEntry: BodyEntry | null, index: number): BodyEntry {
    const ephemerisId = !parentEntry && hasEphemeris(body.id) ? body.id : null
    const parentGroup: THREE.Object3D = parentEntry ? parentEntry.pivot : scene

    const orbitFrame = new THREE.Object3D()
    if (!ephemerisId) {
      orbitFrame.rotation.order = 'YXZ'
      orbitFrame.rotation.y = degToRad((index * 137.508) % 360)
      orbitFrame.rotation.x = degToRad(body.orbitalInclinationDeg || 0)
    }
    parentGroup.add(orbitFrame)

    const pivot = new THREE.Object3D()
    orbitFrame.add(pivot)
    const tiltGroup = new THREE.Object3D()
    tiltGroup.rotation.z = degToRad(body.axialTiltDeg || 0)
    pivot.add(tiltGroup)

    const radiusKm = body.type === 'star' ? SUN_RADIUS_KM : body.radiusKm
    const mesh = body.type === 'spacecraft' ? buildSpacecraftMesh() : new THREE.Mesh(SPHERE_GEOMETRY, buildMaterial(body, textures))
    mesh.scale.setScalar(radiusKm)
    mesh.userData.bodyId = body.id
    tiltGroup.add(mesh)
    raycastTargets.push(mesh)

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
      extraMeshes.push({ mesh: clouds, radiusMultiplier: 1.004, spinFactor: 1.15 })
    }
    if (isRinged(body.id)) {
      const ring = buildRing(body.id, textures)
      tiltGroup.add(ring)
      extraMeshes.push({ mesh: ring, radiusMultiplier: 1, spinFactor: 0 })
    }
    for (const extra of extraMeshes) extra.mesh.scale.setScalar(radiusKm * extra.radiusMultiplier)

    const style = orbitColor(body, parentEntry?.data ?? null)
    let orbitLine: THREE.Line | null = null
    let orbitMaterial: THREE.LineBasicMaterial | null = null
    if (body.type !== 'star') {
      orbitMaterial =
        body.type === 'comet'
          ? new THREE.LineDashedMaterial({
              color: style.color,
              dashSize: COMET_DASH_KM,
              gapSize: COMET_GAP_KM,
              transparent: true,
              opacity: style.opacity,
              depthWrite: false,
            })
          : new THREE.LineBasicMaterial({ color: style.color, transparent: true, opacity: style.opacity, depthWrite: false })
      orbitLine = new THREE.Line(new THREE.BufferGeometry(), orbitMaterial)
      orbitLine.frustumCulled = false
      ;(ephemerisId ? scene : orbitFrame).add(orbitLine)
    }

    const tailMesh = body.type === 'comet' ? buildCometTail(body.color) : null
    if (tailMesh) scene.add(tailMesh)

    const entry: BodyEntry = {
      id: body.id,
      data: body,
      type: body.type,
      parentId: parentEntry ? parentEntry.id : null,
      ephemerisId,
      pivot,
      orbitFrame,
      baseFrameRotation: orbitFrame.rotation.clone(),
      trackActive: false,
      mesh,
      extraMeshes,
      orbitLine,
      orbitMaterial,
      orbitBaseOpacity: style.opacity,
      orbitColor: style.color,
      orbitPoints: [],
      orbitOrigin: new THREE.Vector3(),
      orbitBuiltAtMs: Number.NaN,
      tailMesh,
      initialTheta: index * 1.35,
      angularSpeedPerSimHour:
        body.type === 'star' || !(body.orbitalPeriodDays > 0)
          ? 0
          : ((body.retrograde ? -1 : 1) * (2 * Math.PI)) / (body.orbitalPeriodDays * 24),
      spinRadPerSimHour: spinRadPerSimHour(body.rotationPeriodHours),
      radiusKm,
      semiMajorAxisKm: parentEntry ? (body.distanceFromParentKm ?? 0) : (body.distanceFromSunAU ?? 0) * 149_597_870.7,
      eccentricity: Math.min(Math.max(body.orbitalEccentricity ?? 0, 0), 0.99),
    }
    byId.set(body.id, entry)
    list.push(entry)
    markerEntries.push({
      id: body.id,
      name: body.name,
      type: body.type,
      color: body.type === 'moon' ? (bodyById.get(entry.parentId ?? '')?.color ?? style.color) : style.color,
      worldKm: new THREE.Vector3(),
      radiusKm,
      parentId: entry.parentId,
      orbitRadiusKm: entry.semiMajorAxisKm,
    })
    return entry
  }

  const sun = planetsData.find((b) => b.type === 'star')
  if (!sun) throw new Error('planet data has no star')
  const primaries = planetsData.filter((b) => b.type === 'planet' || b.type === 'dwarfPlanet' || b.type === 'comet' || b.type === 'asteroid')
  const moons = planetsData.filter((b) => b.type === 'moon' || b.type === 'spacecraft')

  makeEntry(sun, null, 0)
  primaries.forEach((body, i) => makeEntry(body, null, i + 1))
  moons.forEach((body, i) => {
    const parent = body.parent ? byId.get(body.parent) : undefined
    if (parent) makeEntry(body, parent, i + 1)
  })

  function periodFitsCoverage(entry: BodyEntry): boolean {
    const coverage = trackCoverage(entry.id)
    const periodMs = entry.data.orbitalPeriodDays * 86_400_000
    return coverage !== null && Number.isFinite(periodMs) && periodMs > 0 && periodMs < coverage.endMs - coverage.startMs
  }

  function rebuildTrackOrbit(entry: BodyEntry, simTimeMs: number): void {
    const coverage = entry.type === 'spacecraft' ? trackCoverage(entry.id) : null
    const fullCoverage = coverage !== null && !periodFitsCoverage(entry)
    const center = fullCoverage ? (coverage.startMs + coverage.endMs) / 2 : simTimeMs
    const spanDays = fullCoverage ? (coverage.endMs - coverage.startMs) / 86_400_000 : entry.data.orbitalPeriodDays
    const samples = fullCoverage ? coverage.count - 1 : coverage ? Math.max(180, Math.round((spanDays * 86_400_000) / coverage.stepMs)) : 180
    entry.orbitPoints = moonOrbitPath(entry.id, center, spanDays, samples).map((v) =>
      eclipticKmVecToScene(v, new THREE.Vector3())
    )
    entry.orbitBuiltAtMs = simTimeMs
    writeOrbitBuffer(entry, entry.orbitOrigin.set(0, 0, 0))
  }

  function placeOnTrack(entry: BodyEntry, simTimeMs: number): boolean {
    const tracked = entry.type === 'moon' || entry.type === 'spacecraft'
    const p = tracked ? moonPosition(entry.id, simTimeMs) : null
    if (entry.type === 'spacecraft') {
      entry.pivot.visible = p !== null
      if (!p) {
        entry.trackActive = false
        return true
      }
    }
    if (!p) {
      if (entry.trackActive) {
        entry.trackActive = false
        entry.orbitFrame.rotation.copy(entry.baseFrameRotation)
        rebuildOrbit(entry, simTimeMs)
      }
      return false
    }
    if (!entry.trackActive) {
      entry.trackActive = true
      entry.orbitFrame.rotation.set(0, 0, 0)
      entry.orbitBuiltAtMs = Number.NaN
    }
    eclipticKmVecToScene(p, entry.pivot.position)
    const rebuildAfterMs = entry.type === 'spacecraft' && !periodFitsCoverage(entry) ? Number.POSITIVE_INFINITY : (entry.data.orbitalPeriodDays * 86_400_000) / 4
    if (!(Math.abs(simTimeMs - entry.orbitBuiltAtMs) < rebuildAfterMs)) rebuildTrackOrbit(entry, simTimeMs)
    return true
  }

  function placeAt(entry: BodyEntry, simTimeMs: number): void {
    if (placeOnTrack(entry, simTimeMs)) return
    if (entry.ephemerisId) {
      eclipticKmToScene(heliocentricEcliptic(entry.ephemerisId, simTimeMs), entry.pivot.position)
      return
    }
    const theta = entry.initialTheta + entry.angularSpeedPerSimHour * ((simTimeMs - J2000_MS) / MS_PER_HOUR)
    const { x, z } = keplerianPosition(theta, entry.semiMajorAxisKm, entry.eccentricity)
    entry.pivot.position.set(x, 0, z)
  }

  function updateFrame(simTimeMs: number, deltaSimHours: number): void {
    for (const entry of list) {
      if (entry.type !== 'star') {
        placeAt(entry, simTimeMs)
        if (entry.ephemerisId && !(Math.abs(simTimeMs - entry.orbitBuiltAtMs) < ORBIT_REBUILD_MS)) rebuildOrbit(entry, simTimeMs)
      }
      entry.mesh.rotation.y += entry.spinRadPerSimHour * deltaSimHours
      for (const extra of entry.extraMeshes) {
        if (extra.spinFactor) extra.mesh.rotation.y += entry.spinRadPerSimHour * extra.spinFactor * deltaSimHours
      }
    }
    scene.updateMatrixWorld()
    for (const entry of list) updateCometTail(entry)
    markerEntries.forEach((marker, i) => {
      const entry = list[i]!
      entry.mesh.getWorldPosition(marker.worldKm)
      marker.hidden = entry.type === 'spacecraft' && !entry.pivot.visible
    })
  }

  function updateView(camera: THREE.PerspectiveCamera, viewportHeight: number, selectedId: string | null, orbitsOn: boolean): void {
    const fovY = degToRad(camera.fov)
    for (const entry of list) {
      if (!entry.orbitLine || !entry.orbitMaterial) continue
      const selected = entry.id === selectedId
      entry.orbitMaterial.opacity = selected ? ORBIT_OPACITY.selected : entry.orbitBaseOpacity
      let visible = (orbitsOn || selected) && (entry.type !== 'spacecraft' || entry.trackActive)
      if (visible && entry.parentId && entry.parentId !== 'sun') {
        const parent = byId.get(entry.parentId)
        if (parent) {
          parent.pivot.getWorldPosition(_parentPos)
          const px = projectedRadiusPx(entry.semiMajorAxisKm, camera.position.distanceTo(_parentPos), fovY, viewportHeight)
          visible = selected || moonVisible(px)
        }
      }
      entry.orbitLine.visible = visible
      const heliocentricTrack = entry.type === 'spacecraft' && entry.parentId === 'sun'
      if (!visible || !(entry.ephemerisId || heliocentricTrack)) continue
      entry.pivot.getWorldPosition(_worldPos)
      const near = camera.position.distanceTo(_worldPos) < ORBIT_LOCAL_FRACTION * _worldPos.length()
      if (near) writeOrbitBuffer(entry, _worldPos, insertOnPath(entry.orbitPoints, _worldPos))
      else if (entry.orbitOrigin.lengthSq() !== 0) writeOrbitBuffer(entry, new THREE.Vector3())
    }
  }

  for (const entry of list) {
    if (entry.type !== 'star') rebuildOrbit(entry, initialSimTimeMs)
  }

  const unsubscribeSets = onSetRegistered(() => {
    for (const entry of list) if (entry.trackActive) entry.orbitBuiltAtMs = Number.NaN
  })

  const moonSystems: MoonSystem[] = []
  for (const planet of list) {
    const set = moonSetFor(planet.id)
    const members = list.filter((e) => e.parentId === planet.id)
    if (!set || members.length === 0) continue
    moonSystems.push({
      planetId: planet.id,
      set,
      memberIds: members.map((m) => m.id),
      outerOrbitKm: Math.max(0, ...members.filter((m) => m.type === 'moon').map((m) => m.semiMajorAxisKm)),
    })
  }
  updateFrame(initialSimTimeMs, 0)

  const earth = byId.get('earth')
  if (!earth || !(earth.mesh.material instanceof THREE.MeshPhongMaterial)) throw new Error('planet data has no earth')

  return {
    list,
    byId,
    raycastTargets,
    markerEntries,
    earthMaterial: earth.mesh.material,
    updateFrame,
    updateView,
    moonSystems,
    dispose: unsubscribeSets,
    getBodyWorldPos(bodyId, target) {
      const entry = byId.get(bodyId)
      if (!entry) return target.set(0, 0, 0)
      return entry.mesh.getWorldPosition(target)
    },
  }
}
