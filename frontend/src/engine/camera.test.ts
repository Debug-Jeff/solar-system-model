import * as THREE from 'three'
import { expect, test } from 'vitest'
import { CAMERA_FAR_KM, CAMERA_NEAR_KM, MAX_DISTANCE_KM, STARFIELD_RADIUS_KM } from './scene'

test('unprojecting the far plane (zoom-to-cursor) stays finite', () => {
  const camera = new THREE.PerspectiveCamera(45, 16 / 9, CAMERA_NEAR_KM, CAMERA_FAR_KM)
  camera.position.set(-5.4e8, 9.7e6, -5.9e8)
  camera.lookAt(-5.36e8, 9.5e6, -5.87e8)
  camera.updateMatrixWorld()
  camera.updateProjectionMatrix()
  const v = new THREE.Vector3(0.3, -0.2, 1).unproject(camera).sub(camera.position).normalize()
  expect(v.toArray().every(Number.isFinite)).toBe(true)
})

test('the starfield and the farthest zoom fit inside the far plane', () => {
  expect(STARFIELD_RADIUS_KM + MAX_DISTANCE_KM).toBeLessThan(CAMERA_FAR_KM)
})
