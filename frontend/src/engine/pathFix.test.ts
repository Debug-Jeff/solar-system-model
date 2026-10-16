import * as THREE from 'three'
import { expect, test } from 'vitest'
import { clampOutsideSphere, insertOnPath } from './pathFix'

function circle(n: number, r: number) {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= n; i++) pts.push(new THREE.Vector3(r * Math.cos((2 * Math.PI * i) / n), 0, r * Math.sin((2 * Math.PI * i) / n)))
  return pts
}

test('insertOnPath puts a body sitting between two vertices exactly on the polyline', () => {
  const pts = circle(36, 1000)
  const a = (2 * Math.PI * 5.5) / 36
  const body = new THREE.Vector3(1000 * Math.cos(a), 0, 1000 * Math.sin(a))
  const out = insertOnPath(pts, body)
  expect(out).toHaveLength(pts.length + 1)
  expect(out[6]).toBe(body)
  expect(out[5]).toBe(pts[5])
  expect(out[7]).toBe(pts[6])
})

test('insertOnPath works for a body near the wrap-around seam', () => {
  const pts = circle(36, 1000)
  const a = (2 * Math.PI * 35.5) / 36
  const body = new THREE.Vector3(1000 * Math.cos(a), 0, 1000 * Math.sin(a))
  const out = insertOnPath(pts, body)
  expect(out[36]).toBe(body)
})

test('clampOutsideSphere pushes a point inside the sphere to its surface along the ray', () => {
  const p = new THREE.Vector3(10, 0, 0)
  expect(clampOutsideSphere(p, new THREE.Vector3(), 100)).toBe(true)
  expect(p.toArray()).toEqual([100, 0, 0])
})

test('clampOutsideSphere leaves points outside alone', () => {
  const p = new THREE.Vector3(0, 300, 0)
  expect(clampOutsideSphere(p, new THREE.Vector3(), 100)).toBe(false)
  expect(p.toArray()).toEqual([0, 300, 0])
})

test('clampOutsideSphere handles a point exactly at the centre', () => {
  const p = new THREE.Vector3(5, 5, 5)
  clampOutsideSphere(p, new THREE.Vector3(5, 5, 5), 10)
  expect(p.distanceTo(new THREE.Vector3(5, 5, 5))).toBeCloseTo(10, 9)
})
