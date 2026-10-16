import * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { beforeEach, expect, test } from 'vitest'
import { createFollowController } from './follow'

let camera: THREE.PerspectiveCamera
let controls: OrbitControls

beforeEach(() => {
  camera = new THREE.PerspectiveCamera()
  camera.position.set(0, 0, 100)
  controls = { target: new THREE.Vector3() } as unknown as OrbitControls
})

test('start flies to the body, then follows its exact displacement', () => {
  const follow = createFollowController(camera, controls)
  follow.start(25_484, 0)
  follow.update(new THREE.Vector3(50, 0, 0), 0)
  follow.update(new THREE.Vector3(50, 0, 0), 1200)
  expect(camera.position.x).toBeCloseTo(50, 9)
  expect(camera.position.z).toBeCloseTo(25_484, 9)
  follow.update(new THREE.Vector3(1050, 0, 0), 1300)
  expect(camera.position.x).toBeCloseTo(1050, 9)
  expect(camera.position.z).toBeCloseTo(25_484, 9)
  expect(controls.target.x).toBeCloseTo(1050, 9)
})

test('update does nothing when stopped', () => {
  const follow = createFollowController(camera, controls)
  follow.start(10, 0)
  follow.stop()
  follow.update(new THREE.Vector3(50, 0, 0), 2000)
  expect(camera.position.toArray()).toEqual([0, 0, 100])
  expect(controls.target.toArray()).toEqual([0, 0, 0])
})

test('user orbit/zoom offset is kept while following', () => {
  const follow = createFollowController(camera, controls)
  follow.start(100, 0)
  follow.update(new THREE.Vector3(0, 0, 0), 1200)
  camera.position.set(30, 40, 0)
  follow.update(new THREE.Vector3(10, 0, 0), 1300)
  expect(camera.position.toArray()).toEqual([40, 40, 0])
})
