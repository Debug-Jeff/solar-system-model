import * as THREE from 'three'
import { expect, test } from 'vitest'
import { elementsPosition, msToJd } from '../ephemeris'
import { BELT_STRIDE } from '../ephemeris/smallBodies'
import { beltPointAU, createKeplerBelt, J2000_JD } from './belts'

function random(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
}

const rnd = random(42)
const rows: number[] = []
for (let k = 0; k < 50; k++) rows.push(2 + rnd() * 40, rnd() * 0.6, rnd() * 40, rnd() * 360, rnd() * 360, rnd() * 360, 0.2 * rnd() + 0.001, 2461200.5)
for (const [a, e] of [[45, 0.9], [300, 0.97], [1245, 0.993], [800, 0.995]] as const) {
  for (let k = 0; k < 8; k++) rows.push(a, e, rnd() * 40, rnd() * 360, rnd() * 360, k * 45 + rnd() * 2, 0.9856 / Math.pow(a, 1.5), 2461200.5)
}
const ROWS = rows.length / BELT_STRIDE

test.each([Date.UTC(1900, 0, 1), Date.UTC(2026, 9, 16), Date.UTC(2050, 11, 31)])('the shader maths matches elementsPosition at %d', (ms) => {
  const days = msToJd(ms) - J2000_JD
  for (let k = 0; k < ROWS; k++) {
    const r = rows.slice(k * BELT_STRIDE, k * BELT_STRIDE + BELT_STRIDE)
    const p = beltPointAU(r, days)
    const q = elementsPosition({ a: r[0]!, e: r[1]!, i: r[2]!, om: r[3]!, w: r[4]!, ma: r[5]!, n: r[6]!, epochJd: r[7]! }, ms)
    expect(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) / Math.max(1, Math.hypot(q.x, q.y, q.z))).toBeLessThan(1e-6)
  }
})

test('createKeplerBelt builds one point per row and updates its time uniform', () => {
  const scene = new THREE.Scene()
  const belt = createKeplerBelt(scene, { count: 50, rows: Float64Array.from(rows) }, 0x9c9284, 1.5)
  expect(belt.points.geometry.getAttribute('aOrbitA').count).toBe(50)
  const ms = Date.UTC(2030, 0, 1)
  belt.update(ms)
  expect((belt.points.material as THREE.ShaderMaterial).uniforms.uDays!.value).toBeCloseTo(msToJd(ms) - J2000_JD, 6)
  expect(scene.children).toContain(belt.points)
  belt.dispose()
  expect(scene.children).not.toContain(belt.points)
})

test('a belt keeps 0.8 opacity by default and can be restyled without rebuilding', () => {
  const belt = createKeplerBelt(new THREE.Scene(), { count: 1, rows: Float64Array.from([2.7, 0.1, 10, 80, 73, 0, 0.21, 2461200.5]) }, 0xffffff, 2)
  const uniforms = (belt.points.material as THREE.ShaderMaterial).uniforms
  expect(uniforms.uOpacity!.value).toBe(0.8)
  const geometry = belt.points.geometry
  belt.setStyle(3, 0.4)
  expect(uniforms.uOpacity!.value).toBe(0.4)
  expect(uniforms.uSize!.value).toBeGreaterThanOrEqual(3)
  expect(belt.points.geometry).toBe(geometry)
})
