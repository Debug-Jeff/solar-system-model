import * as THREE from 'three'
import { expect, test } from 'vitest'
import { heliocentricEcliptic } from '../ephemeris'
import { AU_KM, eclipticKmToScene } from './frames'

test('eclipticKmToScene maps (x, y, z) AU to (x, z, -y) km', () => {
  const v = eclipticKmToScene({ x: 1, y: 2, z: 3 }, new THREE.Vector3())
  expect(v.x).toBeCloseTo(AU_KM, 3)
  expect(v.y).toBeCloseTo(3 * AU_KM, 3)
  expect(v.z).toBeCloseTo(-2 * AU_KM, 3)
})

test('at the March 2026 equinox Earth sits along scene -X', () => {
  const earth = eclipticKmToScene(heliocentricEcliptic('earth', Date.UTC(2026, 2, 20, 14, 46)), new THREE.Vector3())
  expect((earth.angleTo(new THREE.Vector3(-1, 0, 0)) * 180) / Math.PI).toBeLessThan(1)
})

test('at the June 2026 solstice Earth sits along scene +Z (handedness)', () => {
  const earth = eclipticKmToScene(heliocentricEcliptic('earth', Date.UTC(2026, 5, 21, 8, 24)), new THREE.Vector3())
  expect((earth.angleTo(new THREE.Vector3(0, 0, 1)) * 180) / Math.PI).toBeLessThan(1)
})

test('Earth is about 1 AU from the Sun in km', () => {
  const earth = eclipticKmToScene(heliocentricEcliptic('earth', Date.UTC(2026, 9, 16)), new THREE.Vector3())
  expect(earth.length() / AU_KM).toBeGreaterThan(0.98)
  expect(earth.length() / AU_KM).toBeLessThan(1.02)
})
