import * as THREE from 'three'
import { expect, test } from 'vitest'
import { projectedRadiusPx, projectToScreen } from './projection'

test('projectedRadiusPx for Earth at four radii', () => {
  expect(projectedRadiusPx(6371, 6371 * 4, (45 * Math.PI) / 180, 1000)).toBeCloseTo(301.8, 1)
})

test('projectedRadiusPx is Infinity inside the body', () => {
  expect(projectedRadiusPx(10, 10, 1, 1000)).toBe(Number.POSITIVE_INFINITY)
  expect(projectedRadiusPx(10, 5, 1, 1000)).toBe(Number.POSITIVE_INFINITY)
})

function camera() {
  const cam = new THREE.PerspectiveCamera(45, 2, 0.1, 1e9)
  cam.position.set(0, 0, 100)
  cam.lookAt(0, 0, 0)
  cam.updateMatrixWorld()
  return cam
}

test('a point ahead of the camera projects to the centre', () => {
  const p = projectToScreen(new THREE.Vector3(0, 0, 0), camera(), 800, 400)
  expect(p.visible).toBe(true)
  expect(p.x).toBeCloseTo(400, 6)
  expect(p.y).toBeCloseTo(200, 6)
})

test('a point behind the camera is not visible', () => {
  expect(projectToScreen(new THREE.Vector3(0, 0, 200), camera(), 800, 400).visible).toBe(false)
})

test('a point far outside the frustum is not visible', () => {
  expect(projectToScreen(new THREE.Vector3(1000, 0, 0), camera(), 800, 400).visible).toBe(false)
})
