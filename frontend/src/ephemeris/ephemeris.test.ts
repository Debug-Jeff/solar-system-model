import { describe, expect, test, vi } from 'vitest'
import elements from './data/smallBodyElements.json'
import horizons from './fixtures/horizons.json'
import {
  availability,
  hasEphemeris,
  loadElements,
  heliocentricEcliptic,
  orbitPath,
  UNIX_EPOCH_JD,
  validateElements,
  type EphemerisId,
  type OrbitalElements,
  type Vec3,
} from './index'

type Row = { jd: number; x: number; y: number; z: number }
const fixtures = horizons as Record<EphemerisId, Row[]>
const jdToMs = (jd: number) => (jd - UNIX_EPOCH_JD) * 86_400_000
const lonDeg = (v: Vec3) => (Math.atan2(v.y, v.x) * 180) / Math.PI
const latDeg = (v: Vec3) => (Math.atan2(v.z, Math.hypot(v.x, v.y)) * 180) / Math.PI
const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)
const norm = (v: Vec3) => Math.hypot(v.x, v.y, v.z)
const rows = (ids: EphemerisId[]) => ids.flatMap((id) => fixtures[id].map((row) => [id, row] as const))

const PLANETS: EphemerisId[] = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']
const now = Date.UTC(2026, 9, 16)
const ceres = (elements as Record<string, OrbitalElements>).ceres!

describe('planets and Pluto vs Horizons', () => {
  test.each(rows(PLANETS))('%s at JD %o: longitude within 0.1°', (id, row) => {
    const v = heliocentricEcliptic(id, jdToMs(row.jd))
    expect(angleDiff(lonDeg(v), lonDeg(row))).toBeLessThan(0.1)
    expect(Math.abs(latDeg(v) - latDeg(row))).toBeLessThan(0.1)
  })

  test.each(rows(PLANETS))('%s at JD %o: distance within 0.5%', (id, row) => {
    const v = heliocentricEcliptic(id, jdToMs(row.jd))
    expect(Math.abs(norm(v) / norm(row) - 1)).toBeLessThan(0.005)
  })
})

const CERES_WINDOW_DAYS = 10 * 365.25 + 1
const ceresRows = rows(['ceres'])
const ceresNear = ceresRows.filter(([, row]) => Math.abs(row.jd - ceres.epochJd) <= CERES_WINDOW_DAYS)
const ceresFar = ceresRows.filter(([, row]) => Math.abs(row.jd - ceres.epochJd) > CERES_WINDOW_DAYS)

test('ceres fixtures cover both windows', () => {
  expect(ceresNear.length).toBeGreaterThanOrEqual(3)
  expect(ceresFar.length).toBeGreaterThanOrEqual(2)
})

test.each(ceresNear)('%s at JD %o (within ±10y of epoch): exact and within 1°', (id, row) => {
  const v = heliocentricEcliptic(id, jdToMs(row.jd))
  expect(availability(id, jdToMs(row.jd))).toBe('exact')
  expect(angleDiff(lonDeg(v), lonDeg(row))).toBeLessThan(1)
  expect(Math.abs(latDeg(v) - latDeg(row))).toBeLessThan(1)
})

test.each(ceresFar)('%s at JD %o (beyond ±10y): approximate and within 5°', (id, row) => {
  const v = heliocentricEcliptic(id, jdToMs(row.jd))
  expect(availability(id, jdToMs(row.jd))).toBe('approximate')
  expect(angleDiff(lonDeg(v), lonDeg(row))).toBeLessThan(5)
})

test.each(rows(['halley', 'encke']))('%s at JD %o: within 1° of Horizons at epoch ±1y', (id, row) => {
  const v = heliocentricEcliptic(id, jdToMs(row.jd))
  expect(angleDiff(lonDeg(v), lonDeg(row))).toBeLessThan(1)
  expect(Math.abs(latDeg(v) - latDeg(row))).toBeLessThan(1)
})

test('orbitPath closes', () => {
  const p = orbitPath('mars', now)
  expect(p).toHaveLength(361)
  const a = p[0]!
  const b = p[360]!
  expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(1e-3)
})

test('orbitPath for a comet closes too', () => {
  const p = orbitPath('encke', now, 90)
  expect(p).toHaveLength(91)
  const a = p[0]!
  const b = p[90]!
  expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(1e-6)
})

test('availability', () => {
  expect(availability('mars', now)).toBe('exact')
  expect(availability('pluto', now)).toBe('exact')
  expect(availability('ceres', now)).toBe('exact')
  expect(availability('halley', now)).toBe('approximate')
  expect(availability('io', now)).toBe('approximate')
  expect(availability('ceres', jdToMs(ceres.epochJd + 365.25 * 11))).toBe('approximate')
})

test.each([{ e: 1 }, { e: 1.2 }, { e: -0.1 }, { a: 0 }, { i: Number.NaN }, { n: Number.POSITIVE_INFINITY }])(
  'validateElements rejects %o',
  (patch) => expect(() => validateElements({ ...ceres, ...patch })).toThrow()
)

test('hasEphemeris', () => {
  expect(hasEphemeris('mars')).toBe(true)
  expect(hasEphemeris('halley')).toBe(true)
  expect(hasEphemeris('io')).toBe(false)
  expect(hasEphemeris('__proto__')).toBe(false)
})

test('halley orbit line passes through the comet at perihelion', () => {
  const halley = (elements as Record<string, OrbitalElements>).halley!
  const periJd = halley.epochJd + (360 - halley.ma) / halley.n
  const ms = jdToMs(periJd)
  const comet = heliocentricEcliptic('halley', ms)
  const nearest = Math.min(...orbitPath('halley', ms + 40 * 86_400_000).map((p) => Math.hypot(p.x - comet.x, p.y - comet.y, p.z - comet.z)))
  expect(nearest).toBeLessThan(0.01)
})

test('the Sun is always exact', () => {
  expect(availability('sun', now)).toBe('exact')
})

test('invalid small-body elements are dropped with an error, not thrown', () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const loaded = loadElements({ ceres: { ...ceres, e: 1.2 }, halley: (elements as Record<string, OrbitalElements>).halley, encke: 'nope' })
  expect(Object.keys(loaded)).toEqual(['halley'])
  expect(error).toHaveBeenCalledTimes(2)
  error.mockRestore()
})
