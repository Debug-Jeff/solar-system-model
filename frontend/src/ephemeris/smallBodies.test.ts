import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import real from '../../public/data/smallbodies.json'
import { availability, elementsPosition, hasEphemeris, heliocentricEcliptic, registerKeplerBody, resetKeplerRegistry, type OrbitalElements } from './index'
import { parseSmallBodies } from './smallBodies'
import { msToJd } from './types'

const el: OrbitalElements = { epochJd: 2461200.5, a: 2.5, e: 0.1, i: 5, om: 10, w: 20, ma: 30, n: 0.25 }
const named = (patch: Record<string, unknown> = {}) => ({ id: 'vesta', name: 'Vesta', type: 'asteroid', designation: '4', radiusKm: 261, elements: el, ...patch })
const raw = (patch: Record<string, unknown> = {}) => ({
  version: 1,
  generatedAt: '2026-10-16T00:00:00Z',
  named: [named()],
  belts: { main: { count: 1, rows: [2.7, 0.1, 5, 10, 20, 30, 0.2, 2461200.5] }, kuiper: { count: 0, rows: [] } },
  neos: [],
  ...patch,
})

beforeEach(() => resetKeplerRegistry())
afterEach(() => vi.restoreAllMocks())

test('the real snapshot parses', () => {
  const data = parseSmallBodies(real)
  expect(data.named.length).toBeGreaterThanOrEqual(20)
  expect(data.belts.main.count).toBeGreaterThan(1000)
  expect(data.belts.main.rows.length).toBe(data.belts.main.count * 8)
})

test.each([
  ['bad id', named({ id: 'Vesta!' })],
  ['bad type', named({ type: 'planet' })],
  ['hyperbolic', named({ elements: { ...el, e: 1.2 } })],
  ['NaN radius', named({ radiusKm: Number.NaN })],
  ['long name', named({ name: 'x'.repeat(200) })],
])('drops a named body with %s', (_n, body) => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  expect(parseSmallBodies(raw({ named: [body, named({ id: 'ok' })] })).named.map((b) => b.id)).toEqual(['ok'])
})

test('a script-looking name survives as plain text', () => {
  const data = parseSmallBodies(raw({ named: [named({ name: '<script>alert(1)</script>' })] }))
  expect(data.named[0]!.name).toBe('<script>alert(1)</script>')
})

test('oversize or inconsistent belts are rejected', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  expect(parseSmallBodies(raw({ belts: { main: { count: 6000, rows: new Array(48000).fill(1) }, kuiper: { count: 0, rows: [] } } })).belts.main.count).toBe(0)
  expect(parseSmallBodies(raw({ belts: { main: { count: 2, rows: [1, 2, 3] }, kuiper: { count: 0, rows: [] } } })).belts.main.count).toBe(0)
})

test('neos are validated and capped', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const neo = { id: 'neo-3000000', name: '(2026 A1)', approachMs: 1792120980000, missKm: 6.5e6, speedKmS: 5.5, diameterKm: 0.02, hazardous: false, elements: el }
  const data = parseSmallBodies(raw({ neos: [neo, { ...neo, id: 'neo-x', missKm: Number.NaN }, ...new Array(60).fill(neo).map((n, i) => ({ ...n, id: `neo-${i}` }))] }))
  expect(data.neos.length).toBe(50)
  expect(data.neos[0]!.id).toBe('neo-3000000')
})

test('registered Kepler bodies propagate exactly like elementsPosition', () => {
  registerKeplerBody('vesta', el, 'asteroid')
  const ms = Date.UTC(2027, 0, 1)
  expect(hasEphemeris('vesta')).toBe(true)
  expect(heliocentricEcliptic('vesta', ms)).toEqual(elementsPosition(el, ms))
})

test('availability by kind', () => {
  registerKeplerBody('vesta', el, 'asteroid')
  registerKeplerBody('tempel1', el, 'comet')
  registerKeplerBody('neo-1', el, 'neo')
  const epochMs = (el.epochJd - msToJd(0)) * 86_400_000
  const year = 365.25 * 86_400_000
  expect(availability('vesta', epochMs + 5 * year)).toBe('exact')
  expect(availability('vesta', epochMs - 11 * year)).toBe('approximate')
  expect(availability('tempel1', epochMs)).toBe('approximate')
  expect(availability('neo-1', epochMs + 0.5 * year)).toBe('exact')
  expect(availability('neo-1', epochMs + 2 * year)).toBe('approximate')
})

test('registering an invalid body is refused', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  registerKeplerBody('bad', { ...el, e: 1.5 }, 'asteroid')
  expect(hasEphemeris('bad')).toBe(false)
})
