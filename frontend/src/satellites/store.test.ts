import { InverseRotation, RotateVector, Vector, MakeTime } from 'astronomy-engine'
import { gstime, json2satrec, propagate } from 'satellite.js'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { availability } from '../ephemeris'
import { earthFixedToEcliptic } from '../ephemeris/earthFrame'
import frozenRaw from './fixtures/frozen.json'
import reference from './fixtures/reference.json'
import {
  ommJson,
  onSatellitesRegistered,
  parseSatellitesFile,
  registerSatellites,
  resetSatellites,
  satelliteAvailability,
  satelliteOrbit,
  satelliteOrbitPath,
  satellitePosition,
  satelliteVelocity,
  type SatellitesFile,
} from './store'

const DEG = Math.PI / 180
const DAY = 86_400_000
const frozen = parseSatellitesFile(frozenRaw)
const ommOf = (id: string) => frozen.satellites.find((s) => s.id === id)!.omm
const epochMs = (id: string) => Date.parse(`${ommOf(id).EPOCH}Z`)
const jdToMs = (jd: number) => (jd - 2440587.5) * DAY

beforeEach(() => {
  resetSatellites()
  registerSatellites(frozen)
})
afterEach(() => vi.restoreAllMocks())

function wrap180(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180
}

function subPoint(id: string, utcMs: number): { lon: number; lat: number } {
  const p = satellitePosition(id, utcMs)!
  const fixed = RotateVector(InverseRotation(earthFixedToEcliptic(utcMs)), new Vector(p.x, p.y, p.z, MakeTime(new Date(utcMs))))
  return { lon: Math.atan2(fixed.y, fixed.x) / DEG, lat: Math.asin(fixed.z / Math.hypot(fixed.x, fixed.y, fixed.z)) / DEG }
}

test('the parser rejects malformed files', () => {
  const good = structuredClone(frozenRaw)
  expect(() => parseSatellitesFile(null)).toThrow()
  expect(() => parseSatellitesFile({ ...good, version: 2 })).toThrow()
  expect(() => parseSatellitesFile({ ...good, satellites: 'iss' })).toThrow()
  expect(() => parseSatellitesFile({ ...good, generatedAt: 'soon' })).toThrow()
  expect(() => parseSatellitesFile({ ...good, satellites: Array(65).fill(good.satellites[0]) })).toThrow()
})

test('the parser drops bad entries and keeps the rest', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const good = structuredClone(frozenRaw)
  const bad = [
    { id: 'Bad Id', omm: good.satellites[0]!.omm },
    { id: 'x1', omm: { ...good.satellites[0]!.omm, MEAN_MOTION: 'fast' } },
    { id: 'x2', omm: { ...good.satellites[0]!.omm, EPOCH: undefined } },
    { id: 'x3', omm: { ...good.satellites[0]!.omm, ECCENTRICITY: 1.2 } },
    { id: 'x4', omm: { ...good.satellites[0]!.omm, OBJECT_NAME: '<b>' } },
  ]
  const parsed = parseSatellitesFile({ ...good, satellites: [...good.satellites, ...bad] })
  expect(parsed.satellites.map((s) => s.id)).toEqual(good.satellites.map((s) => s.id))
  expect(warn).toHaveBeenCalledOnce()
})

test.each(Object.entries(reference))('%s is within 1% of its JPL Horizons position', (id, points) => {
  for (const ref of points) {
    const p = satellitePosition(id, jdToMs(ref.jd))!
    const err = Math.hypot(p.x - ref.x, p.y - ref.y, p.z - ref.z)
    expect(err / Math.hypot(ref.x, ref.y, ref.z)).toBeLessThan(0.01)
  }
})

test('the ISS ground point matches satellite.js in its own TEME frame', () => {
  const satrec = json2satrec(ommJson(ommOf('iss')))
  for (const hours of [3, 17, 41]) {
    const t = epochMs('iss') + hours * 3_600_000
    const teme = propagate(satrec, new Date(t))!.position
    const wantLon = wrap180((Math.atan2(teme.y, teme.x) - gstime(new Date(t))) / DEG)
    const wantLat = Math.asin(teme.z / Math.hypot(teme.x, teme.y, teme.z)) / DEG
    const got = subPoint('iss', t)
    expect(Math.abs(wrap180(got.lon - wantLon))).toBeLessThan(0.05)
    expect(Math.abs(got.lat - wantLat)).toBeLessThan(0.05)
  }
})

test('GOES-19 hangs over the equator at about 75.2°W', () => {
  const p = subPoint('goes-19', epochMs('goes-19') + DAY)
  expect(Math.abs(p.lon + 75.2)).toBeLessThan(1)
  expect(Math.abs(p.lat)).toBeLessThan(0.5)
})

test('availability follows the element age, and positions stop past 14 days', () => {
  const t0 = epochMs('iss')
  expect(satelliteAvailability('iss', t0 + 3 * DAY)).toBe('exact')
  expect(satelliteAvailability('iss', t0 - 10 * DAY)).toBe('approximate')
  expect(satelliteAvailability('iss', t0 + 20 * DAY)).toBeNull()
  expect(satellitePosition('iss', t0 + 20 * DAY)).toBeNull()
  expect(satellitePosition('iss', t0 - 20 * DAY)).toBeNull()
  expect(availability('iss', t0 + 3 * DAY)).toBe('exact')
  expect(availability('iss', t0 + 10 * DAY)).toBe('approximate')
  expect(satellitePosition('nope', t0)).toBeNull()
})

test('orbit, path and velocity look like the ISS', () => {
  const orbit = satelliteOrbit('iss')!
  expect(orbit.semiMajorAxisKm).toBeGreaterThan(6760)
  expect(orbit.semiMajorAxisKm).toBeLessThan(6820)
  expect(orbit.periodMs / 60_000).toBeGreaterThan(92)
  expect(orbit.periodMs / 60_000).toBeLessThan(94)
  const t = epochMs('iss') + DAY
  const path = satelliteOrbitPath('iss', t)
  expect(path).toHaveLength(181)
  for (const p of path) expect(Math.hypot(p.x, p.y, p.z)).toBeGreaterThan(6500)
  const ends = Math.hypot(path[0]!.x - path[180]!.x, path[0]!.y - path[180]!.y, path[0]!.z - path[180]!.z)
  expect(ends).toBeLessThan(100)
  const v = satelliteVelocity('iss', t)!
  expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(7.66, 1)
})

test('a newer file replaces an older one, never the reverse, and listeners hear about it', () => {
  const heard = vi.fn()
  const off = onSatellitesRegistered(heard)
  const older: SatellitesFile = { ...frozen, generatedAtMs: frozen.generatedAtMs - DAY, satellites: frozen.satellites.filter((s) => s.id === 'iss') }
  registerSatellites(older)
  expect(satelliteOrbit('hubble')).not.toBeNull()
  expect(heard).not.toHaveBeenCalled()
  const newer: SatellitesFile = { ...older, generatedAtMs: frozen.generatedAtMs + DAY }
  registerSatellites(newer)
  expect(satelliteOrbit('hubble')).toBeNull()
  expect(heard).toHaveBeenCalledOnce()
  off()
})

test('a satellite SGP4 cannot start is dropped; one that fails later returns null without throwing', () => {
  const base = ommOf('iss')
  const doomed = { ...base, MEAN_MOTION: 16.5, ECCENTRICITY: 0.9, MEAN_ANOMALY: 0 }
  const later = { ...base, MEAN_MOTION: 16.5, ECCENTRICITY: 0.9, MEAN_ANOMALY: 180 }
  resetSatellites()
  registerSatellites({ ...frozen, satellites: [{ id: 'doomed', omm: doomed }, { id: 'later', omm: later }, frozen.satellites[0]!] })
  expect(satelliteOrbit('doomed')).toBeNull()
  expect(satelliteOrbit(frozen.satellites[0]!.id)).not.toBeNull()
  const t0 = epochMs('iss')
  const times = Array.from({ length: 200 }, (_, k) => t0 + k * 30_000)
  expect(() => times.map((t) => satellitePosition('later', t))).not.toThrow()
  expect(times.some((t) => satellitePosition('later', t) === null)).toBe(true)
})
