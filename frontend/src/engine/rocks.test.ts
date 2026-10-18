import * as THREE from 'three'
import { expect, test } from 'vitest'
import { rockGeometry } from './rocks'

const radii = (g: THREE.BufferGeometry) => {
  const pos = g.getAttribute('position')
  const out: number[] = []
  for (let i = 0; i < pos.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(pos, i).length())
  return out
}

test('rocks are lumpy, roughly unit-sized and the same every time for the same body', () => {
  const a = radii(rockGeometry('bennu'))
  const b = radii(rockGeometry('bennu'))
  expect(a).toEqual(b)
  expect(Math.max(...a) - Math.min(...a)).toBeGreaterThan(0.15)
  expect(Math.max(...a)).toBeLessThanOrEqual(1.0000001)
  expect(Math.min(...a)).toBeGreaterThan(0.3)
  expect(radii(rockGeometry('eros'))).not.toEqual(a)
})

test('rocks carry per-vertex colour so craters and ridges read as rock', () => {
  const colors = rockGeometry('ida').getAttribute('color')
  expect(colors).toBeDefined()
  const greys = new Set<number>()
  for (let i = 0; i < colors.count; i++) greys.add(Math.round(colors.getX(i) * 50))
  expect(greys.size).toBeGreaterThan(5)
})
