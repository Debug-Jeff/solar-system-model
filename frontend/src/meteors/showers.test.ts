import { afterEach, expect, test, vi } from 'vitest'
import file from '../../public/data/meteor-showers.json'
import { activeShowers, inWindow, loadShowers, nearestPeak, parseShowersFile, solarLongitude, streamBelt } from './showers'

const showers = parseShowersFile(file)
const code = (c: string) => showers.find((s) => s.code === c)!
const active = (iso: string) => activeShowers(showers, Date.parse(iso)).map((s) => s.code)
const DAY = 86_400_000

afterEach(() => vi.restoreAllMocks())

test('the parser rejects malformed showers', () => {
  const good = structuredClone(file)
  expect(() => parseShowersFile({ ...good, version: 2 })).toThrow()
  expect(() => parseShowersFile({ ...good, showers: 'x' })).toThrow()
  const bad = [
    { ...good.showers[0]!, code: 'quad' },
    { ...good.showers[0]!, peakLon: 361 },
    { ...good.showers[0]!, zhr: Number.NaN },
    { ...good.showers[0]!, name: '<script>' },
    { ...good.showers[0]!, elements: { ...good.showers[0]!.elements, e: 1 } },
    { ...good.showers[0]!, elements: { ...good.showers[0]!.elements, a: -1 } },
  ]
  for (const s of bad) expect(() => parseShowersFile({ ...good, showers: [s] }), JSON.stringify(s).slice(0, 40)).toThrow()
})

test('solar longitude is J2000: by 2026 precession puts the equinox and solstice 0.36° short of 0° and 90°', () => {
  expect(solarLongitude(Date.parse('2026-03-20T14:46:00Z'))).toBeCloseTo(359.64, 1)
  expect(solarLongitude(Date.parse('2026-06-21T08:24:00Z'))).toBeCloseTo(89.64, 1)
  const y2000 = solarLongitude(Date.parse('2000-03-20T07:35:00Z'))
  expect(Math.min(y2000, 360 - y2000)).toBeLessThan(0.02)
})

test('windows work with and without wrapping past 360°', () => {
  expect(inWindow(100, 50, 150)).toBe(true)
  expect(inWindow(40, 50, 150)).toBe(false)
  expect(inWindow(355, 350, 10)).toBe(true)
  expect(inWindow(5, 350, 10)).toBe(true)
  expect(inWindow(20, 350, 10)).toBe(false)
})

test('activity follows the solar longitude in any year, across New Year', () => {
  expect(active('2026-10-18T12:00:00Z')).toContain('ORI')
  expect(active('2026-10-18T12:00:00Z')).not.toContain('PER')
  expect(active('2027-01-01T12:00:00Z')).toContain('QUA')
  expect(active('2026-12-30T12:00:00Z')).toContain('QUA')
  expect(active('2027-01-20T12:00:00Z')).not.toContain('QUA')
  expect(active('1950-08-12T12:00:00Z')).toContain('PER')
  expect(active('2049-08-12T12:00:00Z')).toContain('PER')
  expect(active('2026-03-05T12:00:00Z')).toEqual([])
  const zhrs = activeShowers(showers, Date.parse('2026-10-20T00:00:00Z')).map((s) => s.zhr)
  expect([...zhrs].sort((a, b) => b - a)).toEqual(zhrs)
})

test('streams are deterministic and stay on bound orbits near the parent', () => {
  const per = code('PER')
  const a = streamBelt(per)
  const b = streamBelt(per)
  expect(a.count).toBe(600)
  expect([...a.rows]).toEqual([...b.rows])
  for (let k = 0; k < a.count; k++) {
    const [sa, se] = [a.rows[k * 8]!, a.rows[k * 8 + 1]!]
    expect(Math.abs(sa / per.elements.a - 1)).toBeLessThanOrEqual(0.015 + 1e-12)
    expect(se >= 0 && se < 0.995).toBe(true)
  }
  const tight = { ...code('LYR'), elements: { ...code('LYR').elements, e: 0.994 } }
  const rows = streamBelt(tight).rows
  for (let k = 0; k < 600; k++) expect(rows[k * 8 + 1]!).toBeLessThan(0.995)
})

test('the nearest peak lands on the right day, including across New Year', () => {
  const gem = nearestPeak(code('GEM'), Date.parse('2026-12-10T00:00:00Z'))
  expect(Math.abs(gem - Date.UTC(2026, 11, 14, 12))).toBeLessThan(DAY)
  const qua = nearestPeak(code('QUA'), Date.parse('2026-12-30T00:00:00Z'))
  expect(Math.abs(qua - Date.UTC(2027, 0, 3, 12))).toBeLessThan(1.5 * DAY)
})

test('loadShowers returns null and warns when the file is missing or broken', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  expect(await loadShowers(vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch)).toBeNull()
  expect(await loadShowers(vi.fn(async () => new Response('{"version":1,"showers":[{}]}', { status: 200 })) as unknown as typeof fetch)).toBeNull()
  expect(warn).toHaveBeenCalledTimes(2)
})
