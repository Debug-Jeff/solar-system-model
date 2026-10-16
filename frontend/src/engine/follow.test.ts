import * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { beforeEach, expect, test } from 'vitest'
import { createFollowController, FOLLOW_CAM_DISTANCE } from './follow'

let camera: THREE.PerspectiveCamera
let controls: OrbitControls

beforeEach(() => {
  camera = new THREE.PerspectiveCamera()
  camera.position.set(0, 0, 100)
  controls = { target: new THREE.Vector3() } as unknown as OrbitControls
})

test('start places camera FOLLOW_CAM_DISTANCE from target along current view direction', () => {
  const follow = createFollowController(camera, controls)
  follow.start()
  follow.update(new THREE.Vector3(50, 0, 0))
  expect(FOLLOW_CAM_DISTANCE).toBe(18)
  expect(camera.position.x).toBeCloseTo(50, 9)
  expect(camera.position.z).toBeCloseTo(18, 9)
  expect(controls.target.x).toBeCloseTo(50, 9)
})

test('update lerps 8% toward the moving target', () => {
  const follow = createFollowController(camera, controls)
  follow.start()
  follow.update(new THREE.Vector3(50, 0, 0))
  follow.update(new THREE.Vector3(60, 0, 0))
  expect(controls.target.x).toBeCloseTo(50.8, 9)
})

test('update does nothing when stopped', () => {
  const follow = createFollowController(camera, controls)
  follow.update(new THREE.Vector3(50, 0, 0))
  expect(camera.position.z).toBe(100)
  expect(controls.target.x).toBe(0)
})
