import { expect, test } from 'vitest'
import sky from '../../public/data/sky.json'
import skyRaw from '../../public/data/sky.json?raw'

test('the sky file has the bright-star catalogue, brightest first', () => {
  const count = sky.stars.length / 4
  expect(Number.isInteger(count)).toBe(true)
  expect(count).toBeGreaterThanOrEqual(9000)
  const [ra, dec, vmag] = sky.stars
  expect(ra).toBeCloseTo(101.287, 2)
  expect(dec).toBeCloseTo(-16.716, 2)
  expect(vmag).toBeCloseTo(-1.46, 2)
  for (let i = 1; i < count; i++) expect(sky.stars[i * 4 + 2]!).toBeGreaterThanOrEqual(sky.stars[(i - 1) * 4 + 2]!)
  expect(sky.attribution).toMatch(/CC BY 4\.0/)
})

test('all 88 constellations are present and point at real stars', () => {
  const entries = Object.entries(sky.constellations)
  expect(entries).toHaveLength(88)
  const count = sky.stars.length / 4
  for (const [abbr, pairs] of entries) {
    expect(abbr).toMatch(/^[A-Z][A-Za-z]{2}$/)
    expect(pairs.length % 2).toBe(0)
    for (const i of pairs) expect(Number.isInteger(i) && i >= 0 && i < count).toBe(true)
  }
})

test('the sky file stays small', () => {
  expect(skyRaw.length).toBeLessThan(400_000)
})
