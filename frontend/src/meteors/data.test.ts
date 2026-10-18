import { expect, test } from 'vitest'
import file from '../../public/data/meteor-showers.json'
import raw from '../../public/data/meteor-showers.json?raw'

const byCode = (code: string) => file.showers.find((s) => s.code === code)!

test('twelve showers with unique codes and bound parent orbits', () => {
  expect(file.showers).toHaveLength(12)
  expect(new Set(file.showers.map((s) => s.code)).size).toBe(12)
  for (const s of file.showers) {
    expect(s.elements.e).toBeGreaterThanOrEqual(0)
    expect(s.elements.e).toBeLessThan(0.995)
    expect(s.elements.a).toBeGreaterThan(0)
    for (const lon of [s.startLon, s.peakLon, s.endLon]) expect(lon >= 0 && lon < 360).toBe(true)
  }
})

test('peaks land at their known solar longitudes inside their windows', () => {
  expect(byCode('PER').peakLon).toBeCloseTo(140.0, 0)
  expect(Math.abs(byCode('GEM').peakLon - 262.2)).toBeLessThan(0.5)
  expect(Math.abs(byCode('QUA').peakLon - 283.2)).toBeLessThan(0.5)
  for (const sh of file.showers) {
    expect(sh.startLon).toBeLessThan(sh.peakLon)
    expect(sh.peakLon).toBeLessThan(sh.endLon)
  }
})

test('the showers file stays small', () => {
  expect(raw.length).toBeLessThan(20_000)
})
