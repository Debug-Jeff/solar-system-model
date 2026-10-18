import * as THREE from 'three'
import { expect, test } from 'vitest'
import { zoomCamera } from './zoom'

test('zooming moves the camera along its line to the target and respects the limits', () => {
  const target = new THREE.Vector3(10, 0, 0)
  const camera = new THREE.Vector3(10, 0, 100)
  zoomCamera(camera, target, 0.5, 1, 1000)
  expect(camera.toArray()).toEqual([10, 0, 50])
  zoomCamera(camera, target, 0.001, 1, 1000)
  expect(camera.distanceTo(target)).toBeCloseTo(1, 9)
  zoomCamera(camera, target, 1e9, 1, 1000)
  expect(camera.distanceTo(target)).toBeCloseTo(1000, 9)
})
