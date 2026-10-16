import { expect, test } from 'vitest'
import { eccentricAnomaly, ellipsePoints, keplerianPosition } from './orbit'

test('eccentricAnomaly solves Kepler', () => {
  const M = 1.2
  const e = 0.6
  const E = eccentricAnomaly(M, e)
  expect(E - e * Math.sin(E)).toBeCloseTo(M, 9)
})

test('keplerianPosition at M=0 is perihelion a(1-e) on +x', () => {
  const p = keplerianPosition(0, 10, 0.2)
  expect(p.x).toBeCloseTo(8, 9)
  expect(p.z).toBeCloseTo(0, 9)
})

test('keplerianPosition at M=π is aphelion a(1+e) on -x', () => {
  const p = keplerianPosition(Math.PI, 10, 0.2)
  expect(p.x).toBeCloseTo(-12, 9)
})

test('circular orbit keeps radius', () => {
  for (const M of [0.3, 2, 4.4]) {
    const p = keplerianPosition(M, 5, 0)
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(5, 9)
  }
})

test('ellipsePoints closes the loop with segments+1 xyz triples', () => {
  const pts = ellipsePoints(3, 0.1, 8)
  expect(pts).toHaveLength(27)
  pts.slice(0, 3).forEach((v, i) => expect(v).toBeCloseTo(pts[24 + i]!, 9))
})

test('keplerianPosition moves counter-clockwise about +Y like the ephemeris planets', () => {
  const a = keplerianPosition(0.1, 5, 0.1)
  const b = keplerianPosition(0.2, 5, 0.1)
  expect(a.z * b.x - a.x * b.z).toBeGreaterThan(0)
})
