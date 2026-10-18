import * as THREE from 'three'
import { afterEach, expect, test, vi } from 'vitest'
import { bvToRgb, loadSky, parseSkyFile, raDecToScene, starAlpha, starSizePx } from './sky'

const EPS = (23.4392911 * Math.PI) / 180
const good = () => ({ version: 1, attribution: 'x', stars: [101.287, -16.716, -1.46, 0, 37.95, 89.26, 2.02, 0.6], constellations: { UMi: [0, 1] } })

afterEach(() => vi.restoreAllMocks())

test('the parser accepts a good file and rejects malformed ones', () => {
  const sky = parseSkyFile(good())
  expect(sky.count).toBe(2)
  expect([...sky.constellations.get('UMi')!]).toEqual([0, 1])
  const bad: unknown[] = [
    null,
    { ...good(), version: 2 },
    { ...good(), stars: [1, 2, 3] },
    { ...good(), stars: [1, 2, 'x', 4] },
    { ...good(), stars: [1, 2, Number.NaN, 4] },
    { ...good(), stars: Array(40_004).fill(1) },
    { ...good(), constellations: { UMi: [0] } },
    { ...good(), constellations: { UMi: [0, 2] } },
    { ...good(), constellations: { UMi: [0, 1.5] } },
    { ...good(), constellations: { 'U<b': [0, 1] } },
    { ...good(), constellations: [] },
  ]
  for (const raw of bad) expect(() => parseSkyFile(raw), JSON.stringify(raw)?.slice(0, 60)).toThrow()
})

test('RA/Dec map into the J2000 ecliptic scene frame', () => {
  const v = new THREE.Vector3()
  expect(raDecToScene(0, 90, v).distanceTo(new THREE.Vector3(0, Math.cos(EPS), -Math.sin(EPS)))).toBeLessThan(1e-9)
  expect(raDecToScene(0, 0, v).distanceTo(new THREE.Vector3(1, 0, 0))).toBeLessThan(1e-9)
  expect(raDecToScene(90, 0, v).distanceTo(new THREE.Vector3(0, -Math.sin(EPS), -Math.cos(EPS)))).toBeLessThan(1e-9)
  const pole = new THREE.Vector3(0, Math.cos(EPS), -Math.sin(EPS))
  expect((raDecToScene(37.95, 89.26, v).angleTo(pole) * 180) / Math.PI).toBeLessThan(1)
  expect(raDecToScene(123, -45, v).length()).toBeCloseTo(1, 12)
})

test('star colours run from blue-white through warm white to orange-red', () => {
  const [r1, , b1] = bvToRgb(-0.3)
  expect(b1).toBeGreaterThanOrEqual(r1)
  const [r2, g2, b2] = bvToRgb(0.65)
  expect(r2).toBeGreaterThanOrEqual(g2)
  expect(g2).toBeGreaterThanOrEqual(b2)
  const [r3, , b3] = bvToRgb(1.85)
  expect(r3).toBeGreaterThan(1.3 * b3)
  for (const bv of [-0.4, 0, 0.6, 1.2, 2.5]) for (const c of bvToRgb(bv)) expect(c >= 0 && c <= 1).toBe(true)
})

test('brighter stars are bigger and more opaque, within clamps', () => {
  const mags = [-1.46, 0, 1, 2, 3, 4, 5, 6.5]
  for (let i = 1; i < mags.length; i++) {
    expect(starSizePx(mags[i]!)).toBeLessThanOrEqual(starSizePx(mags[i - 1]!))
    expect(starAlpha(mags[i]!)).toBeLessThanOrEqual(starAlpha(mags[i - 1]!))
  }
  expect(starSizePx(-1.46)).toBe(4)
  expect(starSizePx(6.5)).toBe(0.8)
  expect(starAlpha(-1.46)).toBe(1)
  expect(starAlpha(6.5)).toBe(0.12)
})

test('loadSky returns null and warns once on a missing or broken file', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  expect(await loadSky(vi.fn(async () => new Response('nope', { status: 404 })) as unknown as typeof fetch)).toBeNull()
  expect(await loadSky(vi.fn(async () => new Response('{"version":1', { status: 200 })) as unknown as typeof fetch)).toBeNull()
  expect(warn).toHaveBeenCalledTimes(2)
  const sky = await loadSky(vi.fn(async () => new Response(JSON.stringify(good()), { status: 200 })) as unknown as typeof fetch)
  expect(sky?.count).toBe(2)
})
