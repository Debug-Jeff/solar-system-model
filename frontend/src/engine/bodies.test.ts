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
  stars: tex(), sun: tex(), mercury: tex(), venus: { surface: tex(), atmosphere: tex() },
  earth: { day: tex(), night: tex(), clouds: tex(), normal: tex(), specular: tex() },
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
  expect(parker.orbitLine!.visible).toBe(true)
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
