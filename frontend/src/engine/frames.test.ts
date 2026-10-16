import * as THREE from 'three'
import { expect, test } from 'vitest'
import { heliocentricEcliptic } from '../ephemeris'
import { AU_KM, compressRadial, eclipticKmToScene, eclipticToScene } from './frames'
import { orbitVisualDistance } from './scale'

test('eclipticToScene maps (x, y, z) to (x, z, -y)', () => {
  const v = eclipticToScene({ x: 1, y: 2, z: 3 }, new THREE.Vector3())
  expect(v.toArray()).toEqual([1, 3, -2])
})

test('compressRadial keeps direction and sets length', () => {
  const v = compressRadial({ x: 3, y: 4, z: 0 }, (d) => 2 * d)
  expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(10, 12)
  expect(v.x / v.y).toBeCloseTo(3 / 4, 12)
})

test('compressRadial of the origin is the origin', () => {
  expect(compressRadial({ x: 0, y: 0, z: 0 }, orbitVisualDistance)).toEqual({ x: 0, y: 0, z: 0 })
})

test('at the March 2026 equinox Earth sits along scene -X', () => {
  const ms = Date.UTC(2026, 2, 20, 14, 46)
  const earth = eclipticToScene(compressRadial(heliocentricEcliptic('earth', ms), orbitVisualDistance), new THREE.Vector3())
  const angle = (earth.angleTo(new THREE.Vector3(-1, 0, 0)) * 180) / Math.PI
  expect(angle).toBeLessThan(1)
})

test('eclipticKmToScene scales AU to km and maps axes', () => {
  const v = eclipticKmToScene({ x: 1, y: 0, z: 0 }, new THREE.Vector3())
  expect(v.x).toBeCloseTo(AU_KM, 3)
  expect(v.y).toBe(0)
  expect(v.z).toBeCloseTo(0, 12)
})

test('at the June 2026 solstice Earth sits along scene +Z (handedness)', () => {
  const ms = Date.UTC(2026, 5, 21, 8, 24)
  const earth = eclipticKmToScene(heliocentricEcliptic('earth', ms), new THREE.Vector3())
  const angle = (earth.angleTo(new THREE.Vector3(0, 0, 1)) * 180) / Math.PI
  expect(angle).toBeLessThan(1)
})
