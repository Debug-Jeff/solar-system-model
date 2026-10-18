import * as THREE from 'three'
import { beforeEach, expect, test } from 'vitest'
import earthSet from '../ephemeris/fixtures/moons-frozen/moons-earth.json'
import { moonPosition, registerSet, resetMoonStore } from '../ephemeris/moonStore'
import { parseEphemSet } from '../ephemeris/sampled'
import type { Body } from '../types/body'
import { createBodies } from './bodies'
import { eclipticKmVecToScene } from './frames'
import type { Textures } from './textures'

const tex = () => new THREE.Texture()
const textures: Textures = {
  milkyWay: tex(), sun: tex(), mercury: tex(), venus: { clouds: tex() },
  earth: { day: tex(), night: tex(), clouds: tex(), specular: tex() },
  moon: { map: tex(), bump: tex() }, mars: tex(), jupiter: tex(),
  saturn: { map: tex(), ring: tex() }, uranus: { map: tex(), ring: tex() }, neptune: tex(),
}
const base = { orbitalPeriodDays: 1, rotationPeriodHours: 24, axialTiltDeg: 0, meanTempC: 0, moonCount: 0, facts: [] }
const data: Body[] = [
  { ...base, id: 'sun', name: 'Sun', type: 'star', radiusKm: 696_340 },
  { ...base, id: 'earth', name: 'Earth', type: 'planet', radiusKm: 6371, distanceFromSunAU: 1, axialTiltDeg: 23.4, orbitalPeriodDays: 365.25 },
  { ...base, id: 'moon', name: 'Moon', type: 'moon', parent: 'earth', radiusKm: 1737, distanceFromParentKm: 384_400, orbitalPeriodDays: 27.32, orbitalInclinationDeg: 5.1 },
]
const set = parseEphemSet(earthSet, 'moons-earth')
const track = set.bodies.moon!
const inside = track.startMs + 10.5 * track.stepMs
const outside = track.startMs - 40 * 86_400_000

beforeEach(() => resetMoonStore())

test('a moon on its track sits at planet + track position in the scene', () => {
  const bodies = createBodies(new THREE.Scene(), data, textures, inside)
  registerSet(set)
  bodies.updateFrame(inside, 0)
  const moon = bodies.getBodyWorldPos('moon', new THREE.Vector3())
  const earth = bodies.getBodyWorldPos('earth', new THREE.Vector3())
  const expected = eclipticKmVecToScene(moonPosition('moon', inside)!, new THREE.Vector3())
  expect(moon.sub(earth).distanceTo(expected)).toBeLessThan(1e-3)
  expect(bodies.byId.get('moon')!.trackActive).toBe(true)
  bodies.dispose()
})

test('outside the window the moon falls back with its original frame rotation and a finite position', () => {
  const bodies = createBodies(new THREE.Scene(), data, textures, inside)
  registerSet(set)
  bodies.updateFrame(inside, 0)
  const moon = bodies.byId.get('moon')!
  bodies.updateFrame(outside, 0)
  expect(moon.trackActive).toBe(false)
  expect(moon.orbitFrame.rotation.equals(moon.baseFrameRotation)).toBe(true)
  expect(moon.pivot.position.toArray().every(Number.isFinite)).toBe(true)
  bodies.dispose()
})

test('registering a set rebuilds the moon orbit line from the track', () => {
  const mid = track.startMs + (track.count - 1) * track.stepMs * 0.5
  const bodies = createBodies(new THREE.Scene(), data, textures, mid)
  bodies.updateFrame(mid, 0)
  const moon = bodies.byId.get('moon')!
  const placeholderPoints = moon.orbitPoints.length
  registerSet(set)
  bodies.updateFrame(mid, 0)
  expect(moon.orbitPoints.length).toBe(181)
  expect(placeholderPoints).not.toBe(181)
  bodies.dispose()
})

test('moon systems list each planet with moons and its set', () => {
  const bodies = createBodies(new THREE.Scene(), data, textures, inside)
  expect(bodies.moonSystems).toEqual([{ planetId: 'earth', set: 'moons-earth', memberIds: ['moon'], outerOrbitKm: 384_400 }])
  bodies.dispose()
})

import spacecraftFixture from '../ephemeris/fixtures/moons-frozen/spacecraft.json'

const craftData: Body[] = [
  ...data,
  { ...base, id: 'parker', name: 'Parker Solar Probe', type: 'spacecraft', parent: 'sun', radiusKm: 0.01, orbitalPeriodDays: Number.NaN, rotationPeriodHours: 0, axialTiltDeg: Number.NaN, meanTempC: Number.NaN, moonCount: Number.NaN },
]
const craftSet = parseEphemSet(spacecraftFixture, 'spacecraft')
const parkerTrack = craftSet.bodies.parker!
const parkerInside = parkerTrack.startMs + 100.5 * parkerTrack.stepMs

test('a spacecraft without track data is hidden (mesh, trail and marker)', () => {
  const bodies = createBodies(new THREE.Scene(), craftData, textures, parkerInside)
  bodies.updateFrame(parkerInside, 0)
  const parker = bodies.byId.get('parker')!
  expect(parker.pivot.visible).toBe(false)
  expect(bodies.markerEntries.find((m) => m.id === 'parker')!.hidden).toBe(true)
  bodies.dispose()
})

test('a spacecraft on its track is visible at its heliocentric position with a trail', () => {
  const bodies = createBodies(new THREE.Scene(), craftData, textures, parkerInside)
  registerSet(craftSet)
  bodies.updateFrame(parkerInside, 0)
  const parker = bodies.byId.get('parker')!
  expect(parker.pivot.visible).toBe(true)
  expect(bodies.markerEntries.find((m) => m.id === 'parker')!.hidden).toBe(false)
  const expected = eclipticKmVecToScene(moonPosition('parker', parkerInside)!, new THREE.Vector3())
  expect(bodies.getBodyWorldPos('parker', new THREE.Vector3()).distanceTo(expected)).toBeLessThan(1e-2)
  expect(parker.orbitPoints.length).toBeGreaterThan(100)
  bodies.dispose()
})

test('a planet-bound spacecraft does not widen the moon-system load trigger', () => {
  const withJwst: Body[] = [...data, { ...base, id: 'jwst', name: 'JWST', type: 'spacecraft', parent: 'earth', radiusKm: 0.01, distanceFromParentKm: 1_500_000 }]
  const bodies = createBodies(new THREE.Scene(), withJwst, textures, inside)
  const earth = bodies.moonSystems.find((m) => m.planetId === 'earth')!
  expect(earth.outerOrbitKm).toBe(384_400)
  expect(earth.memberIds).toEqual(['moon', 'jwst'])
  bodies.dispose()
})

import marsFixture from '../ephemeris/fixtures/moons-frozen/moons-mars.json'

test('a Sun-orbiting spacecraft trail shows with Orbits on and uses the native samples', () => {
  const bodies = createBodies(new THREE.Scene(), craftData, textures, parkerInside)
  registerSet(craftSet)
  bodies.updateFrame(parkerInside, 0)
  const cam = new THREE.PerspectiveCamera(45, 2, 0.001, 1e11)
  cam.position.set(0, 1e9, 1e9)
  cam.lookAt(0, 0, 0)
  cam.updateMatrixWorld()
  bodies.updateView(cam, 800, null, true)
  const parker = bodies.byId.get('parker')!
  expect(parker.orbitLine!.visible).toBe(false)
  expect(parker.trail!.line.visible).toBe(true)
  expect(parker.orbitPoints.length).toBe(parkerTrack.count)
  bodies.dispose()
})

test('a Mars orbiter trail covers one orbit, not weeks of overlapping loops', () => {
  const marsSet = parseEphemSet(marsFixture, 'moons-mars')
  const mroTrack = marsSet.bodies.mro!
  const mid = mroTrack.startMs + (mroTrack.count - 1) * mroTrack.stepMs * 0.5
  const withMro: Body[] = [
    ...data,
    { ...base, id: 'mars', name: 'Mars', type: 'planet', radiusKm: 3390, distanceFromSunAU: 1.52 },
    { ...base, id: 'mro', name: 'MRO', type: 'spacecraft', parent: 'mars', radiusKm: 0.01, distanceFromParentKm: 3700, orbitalPeriodDays: 0.0782 },
  ]
  const bodies = createBodies(new THREE.Scene(), withMro, textures, mid)
  registerSet(marsSet)
  bodies.updateFrame(mid, 0)
  const mro = bodies.byId.get('mro')!
  expect(mro.orbitPoints.length).toBe(181)
  const first = mro.orbitPoints[0]!
  const last = mro.orbitPoints[180]!
  expect(first.distanceTo(last)).toBeLessThan(200)
  bodies.dispose()
})

import { earthOrientation } from './earthOrientation'

test('Earth and its clouds take their real orientation from the sim time', () => {
  const t = Date.parse('2026-10-17T06:00:00Z')
  const bodies = createBodies(new THREE.Scene(), data, textures, t)
  bodies.updateFrame(t + 3_600_000, 1)
  const earth = bodies.byId.get('earth')!
  const want = earthOrientation(t + 3_600_000, new THREE.Quaternion())
  expect(earth.mesh.getWorldQuaternion(new THREE.Quaternion()).angleTo(want)).toBeLessThan(1e-9)
  const clouds = earth.extraMeshes[0]!.mesh.getWorldQuaternion(new THREE.Quaternion())
  expect(new THREE.Vector3(0, 1, 0).applyQuaternion(clouds).angleTo(new THREE.Vector3(0, 1, 0).applyQuaternion(want))).toBeLessThan(1e-9)
  bodies.dispose()
})

import satelliteFixture from '../satellites/fixtures/frozen.json'
import { parseSatellitesFile, registerSatellites, resetSatellites, satellitePosition } from '../satellites/store'

const satFile = parseSatellitesFile(satelliteFixture)
const issEpochMs = Date.parse(`${satFile.satellites.find((s) => s.id === 'iss')!.omm.EPOCH}Z`)
const satBody = (id: string): Body => ({
  ...base,
  id,
  name: id.toUpperCase(),
  type: 'satellite',
  parent: 'earth',
  radiusKm: 0.05,
  distanceFromParentKm: 0,
  orbitalPeriodDays: Number.NaN,
  rotationPeriodHours: 0,
  axialTiltDeg: Number.NaN,
  meanTempC: Number.NaN,
  moonCount: Number.NaN,
})

test('a satellite is hidden until its elements register, then sits at its SGP4 position around Earth', () => {
  resetSatellites()
  const t = issEpochMs + 3_600_000
  const bodies = createBodies(new THREE.Scene(), [...data, satBody('iss')], textures, t)
  bodies.updateFrame(t, 0)
  expect(bodies.byId.get('iss')!.pivot.visible).toBe(false)
  expect(bodies.markerEntries.find((m) => m.id === 'iss')!.hidden).toBe(true)
  registerSatellites(satFile)
  bodies.updateFrame(t, 0)
  expect(bodies.byId.get('iss')!.pivot.visible).toBe(true)
  expect(bodies.markerEntries.find((m) => m.id === 'iss')!.hidden).toBe(false)
  const rel = bodies.getBodyWorldPos('iss', new THREE.Vector3()).sub(bodies.getBodyWorldPos('earth', new THREE.Vector3()))
  expect(rel.distanceTo(eclipticKmVecToScene(satellitePosition('iss', t)!, new THREE.Vector3()))).toBeLessThan(1e-3)
  expect(bodies.markerEntries.find((m) => m.id === 'iss')!.orbitRadiusKm).toBeGreaterThan(6700)
  expect(bodies.byId.get('iss')!.orbitPoints).toHaveLength(181)
  bodies.dispose()
})

test('satellite orbits only show once the Earth system is big on screen', () => {
  resetSatellites()
  registerSatellites(satFile)
  const t = issEpochMs + 3_600_000
  const bodies = createBodies(new THREE.Scene(), [...data, satBody('iss')], textures, t)
  bodies.updateFrame(t, 0)
  const earth = bodies.getBodyWorldPos('earth', new THREE.Vector3())
  const cam = new THREE.PerspectiveCamera(45, 2, 0.001, 1e11)
  const look = (distanceKm: number) => {
    cam.position.copy(earth).add(new THREE.Vector3(0, distanceKm, distanceKm))
    cam.lookAt(earth)
    cam.updateMatrixWorld()
    bodies.updateView(cam, 800, null, true)
    return bodies.byId.get('iss')!.trail!.line.visible
  }
  expect(look(5e7)).toBe(false)
  expect(look(3e4)).toBe(true)
  bodies.dispose()
})

test('at most four satellite orbits rebuild in one frame after a time jump', () => {
  resetSatellites()
  const iss = satFile.satellites.find((s) => s.id === 'iss')!
  const extra = ['iss-b', 'iss-c'].map((id) => ({ id, omm: iss.omm }))
  registerSatellites({ ...satFile, satellites: [...satFile.satellites, ...extra] })
  const ids = ['iss', 'hubble', 'goes-19', 'chandra', 'iss-b', 'iss-c']
  const t0 = issEpochMs
  const bodies = createBodies(new THREE.Scene(), [...data, ...ids.map(satBody)], textures, t0)
  for (let k = 0; k < 3; k++) bodies.updateFrame(t0, 0)
  const t1 = t0 + 86_400_000
  bodies.updateFrame(t1, 24)
  const rebuilt = () => bodies.list.filter((e) => e.type === 'satellite' && e.orbitBuiltAtMs === t1).length
  expect(rebuilt()).toBe(4)
  bodies.updateFrame(t1, 0)
  expect(rebuilt()).toBe(6)
  bodies.dispose()
})

test('Earth city lights are masked to the night side by the Sun direction', () => {
  const bodies = createBodies(new THREE.Scene(), data, textures, inside)
  const material = bodies.byId.get('earth')!.mesh.material as THREE.MeshPhongMaterial
  const shader = { vertexShader: THREE.ShaderLib.phong.vertexShader, fragmentShader: THREE.ShaderLib.phong.fragmentShader, uniforms: {} } as unknown as THREE.WebGLProgramParametersWithUniforms
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer)
  expect(shader.fragmentShader.match(/nightMask/g)?.length).toBeGreaterThanOrEqual(2)
  expect(shader.fragmentShader).toContain('uniform vec3 uSunView;')
  expect(shader.fragmentShader).not.toContain('pointLights[0]')
  expect((shader.uniforms as Record<string, unknown>).uSunView).toBeDefined()
  expect(shader.fragmentShader).toContain('1.0 - smoothstep(-0.25, 0.1,')
  expect(shader.fragmentShader.match(/#include <emissivemap_fragment>/g)).toHaveLength(1)
  expect(material.customProgramCacheKey()).toContain('night')
  expect(material.normalMap).toBeNull()
  bodies.dispose()
})

test('Earth wears an additive atmosphere shell just above the surface', () => {
  const bodies = createBodies(new THREE.Scene(), data, textures, inside)
  const shell = bodies.byId.get('earth')!.extraMeshes.find((e) => e.mesh.material instanceof THREE.ShaderMaterial)!
  expect(shell).toBeDefined()
  expect(shell.radiusMultiplier).toBeCloseTo(1.025, 6)
  const material = shell.mesh.material as THREE.ShaderMaterial
  expect(material.blending).toBe(THREE.AdditiveBlending)
  expect(material.depthWrite).toBe(false)
  expect(material.fragmentShader).toContain('logdepthbuf_fragment')
  bodies.dispose()
})

import { createModelLoader } from './models'

test('a craft swaps in its model when the camera comes close, and stays pickable', async () => {
  resetSatellites()
  registerSatellites(satFile)
  const t = issEpochMs + 3_600_000
  const fakeModel = () => new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), new THREE.MeshStandardMaterial())
  const models = createModelLoader(async () => fakeModel(), { version: 1, models: { iss: { file: 'models/iss.glb', credit: 'NASA 3D Resources' } } })
  const bodies = createBodies(new THREE.Scene(), [...data, satBody('iss')], textures, t, models)
  bodies.updateFrame(t, 0)
  const iss = bodies.byId.get('iss')!
  const cam = new THREE.PerspectiveCamera(45, 2, 0.001, 1e11)
  const place = (distanceKm: number) => {
    cam.position.copy(bodies.getBodyWorldPos('iss', new THREE.Vector3())).add(new THREE.Vector3(0, 0, distanceKm))
    cam.updateMatrixWorld()
    bodies.updateView(cam, 800, null, true)
  }
  place(1e5)
  await Promise.resolve()
  expect(iss.model).toBeNull()
  place(2)
  await new Promise((r) => setTimeout(r, 0))
  expect(iss.model).not.toBeNull()
  expect(iss.model!.parent).toBe(iss.mesh.parent)
  expect((iss.mesh.material as THREE.Material).visible).toBe(false)
  expect(bodies.raycastTargets).toContain(iss.mesh)
  bodies.dispose()
})

test('a craft out of coverage hides its model, and other placeholders stay visible', async () => {
  resetSatellites()
  registerSatellites(satFile)
  const t = issEpochMs + 3_600_000
  const models = createModelLoader(async () => new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), new THREE.MeshStandardMaterial()), { version: 1, models: { iss: { file: 'models/iss.glb', credit: 'NASA 3D Resources' } } })
  const bodies = createBodies(new THREE.Scene(), [...data, satBody('iss'), satBody('hubble')], textures, t, models)
  bodies.updateFrame(t, 0)
  const cam = new THREE.PerspectiveCamera(45, 2, 0.001, 1e11)
  cam.position.copy(bodies.getBodyWorldPos('iss', new THREE.Vector3())).add(new THREE.Vector3(0, 0, 2))
  cam.updateMatrixWorld()
  bodies.updateView(cam, 800, null, true)
  await new Promise((r) => setTimeout(r, 0))
  const iss = bodies.byId.get('iss')!
  expect(iss.model).not.toBeNull()
  expect((bodies.byId.get('hubble')!.mesh.material as THREE.Material).visible).toBe(true)
  bodies.updateFrame(issEpochMs + 30 * 86_400_000, 0)
  let visible = true
  iss.model!.traverseAncestors((a) => { if (!a.visible) visible = false })
  expect(visible).toBe(false)
  bodies.dispose()
})

import { orbitFade } from './bodies'

test('a body\'s own orbit fades out as the body fills the screen', () => {
  expect(orbitFade(2)).toBe(1)
  expect(orbitFade(4)).toBe(1)
  expect(orbitFade(17)).toBeGreaterThan(0)
  expect(orbitFade(17)).toBeLessThan(1)
  expect(orbitFade(30)).toBe(0)
  expect(orbitFade(500)).toBe(0)
})

test('zooming right up to Earth hides its orbit line; from afar it shows', () => {
  const t = Date.parse('2026-10-18T12:00:00Z')
  const bodies = createBodies(new THREE.Scene(), data, textures, t)
  bodies.updateFrame(t, 0)
  const earth = bodies.byId.get('earth')!
  const pos = bodies.getBodyWorldPos('earth', new THREE.Vector3())
  const cam = new THREE.PerspectiveCamera(45, 2, 0.001, 1e11)
  const look = (distanceKm: number) => {
    cam.position.copy(pos).add(new THREE.Vector3(0, distanceKm, 0))
    cam.lookAt(pos)
    cam.updateMatrixWorld()
    bodies.updateView(cam, 800, 'earth', true)
    return earth.orbitLine!.visible
  }
  expect(look(1e8)).toBe(true)
  expect(look(3e4)).toBe(false)
  bodies.dispose()
})

test('trails go to satellites, spacecraft, asteroids and comets; planets keep full orbits', () => {
  const t = Date.parse('2026-10-18T12:00:00Z')
  const bodies = createBodies(new THREE.Scene(), craftData, textures, t)
  expect(bodies.byId.get('parker')!.trail).not.toBeNull()
  expect(bodies.byId.get('earth')!.trail).toBeNull()
  bodies.dispose()
})
