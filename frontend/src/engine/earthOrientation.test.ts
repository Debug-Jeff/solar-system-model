import { Body, GeoVector, MakeTime, RotateVector, Rotation_EQJ_EQD, SiderealTime, SphereFromVector } from 'astronomy-engine'
import * as THREE from 'three'
import { expect, test } from 'vitest'
import { heliocentricEcliptic } from '../ephemeris'
import { earthOrientation } from './earthOrientation'
import { eclipticKmToScene } from './frames'

const DEG = Math.PI / 180
const OBLIQUITY = 23.4392911 * DEG

function wrap180(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180
}

function subsolar(utcMs: number): { lon: number; lat: number } {
  const earth = eclipticKmToScene(heliocentricEcliptic('earth', utcMs), new THREE.Vector3())
  const local = earth.negate().normalize().applyQuaternion(earthOrientation(utcMs, new THREE.Quaternion()).invert())
  return { lon: Math.atan2(-local.z, local.x) / DEG, lat: Math.asin(local.y) / DEG }
}

function expectedSubsolar(utcMs: number): { lon: number; lat: number } {
  const time = MakeTime(new Date(utcMs))
  const ofDate = SphereFromVector(RotateVector(Rotation_EQJ_EQD(time), GeoVector(Body.Sun, time, true)))
  return { lon: wrap180(ofDate.lon - SiderealTime(time) * 15), lat: ofDate.lat }
}

test.each([
  ['2026-03-20T12:00:00Z'],
  ['2026-06-21T00:00:00Z'],
  ['1950-01-01T06:00:00Z'],
  ['2049-12-31T18:00:00Z'],
])('the subsolar point under the mesh matches RA−GAST and declination at %s', (iso) => {
  const t = Date.parse(iso)
  const got = subsolar(t)
  const want = expectedSubsolar(t)
  expect(Math.abs(wrap180(got.lon - want.lon))).toBeLessThan(0.05)
  expect(Math.abs(got.lat - want.lat)).toBeLessThan(0.05)
})

test('almanac checks: equation of time at the March equinox and the June solstice latitude', () => {
  const march = subsolar(Date.parse('2026-03-20T12:00:00Z'))
  expect(march.lon).toBeGreaterThan(1.5)
  expect(march.lon).toBeLessThan(2.2)
  expect(Math.abs(march.lat)).toBeLessThan(0.5)
  const june = subsolar(Date.parse('2026-06-21T12:00:00Z'))
  expect(june.lat).toBeCloseTo(23.44, 1)
})

test('the north pole points along the precessed celestial pole', () => {
  const j2000Pole = new THREE.Vector3(0, Math.cos(OBLIQUITY), -Math.sin(OBLIQUITY))
  const poleAt = (iso: string) => new THREE.Vector3(0, 1, 0).applyQuaternion(earthOrientation(Date.parse(iso), new THREE.Quaternion()))
  expect(poleAt('2000-01-01T12:00:00Z').angleTo(j2000Pole) / DEG).toBeLessThan(0.01)
  const drift = poleAt('2026-10-17T00:00:00Z').angleTo(j2000Pole) / DEG
  expect(drift).toBeGreaterThan(0.1)
  expect(drift).toBeLessThan(0.2)
})
