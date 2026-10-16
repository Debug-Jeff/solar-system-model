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
