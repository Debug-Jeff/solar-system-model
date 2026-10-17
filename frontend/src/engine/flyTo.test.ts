import * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { beforeEach, expect, test } from 'vitest'
import { createCameraFlight, easeInOutCubic, FLIGHT_MS, flyToDistance, followMinDistance } from './flyTo'

let camera: THREE.PerspectiveCamera
let controls: OrbitControls

beforeEach(() => {
  camera = new THREE.PerspectiveCamera()
  camera.position.set(0, 0, 100)
  controls = { target: new THREE.Vector3() } as unknown as OrbitControls
})

test('easeInOutCubic endpoints, midpoint and monotonicity', () => {
  expect(easeInOutCubic(0)).toBe(0)
  expect(easeInOutCubic(1)).toBe(1)
  expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 12)
  let prev = -1
  for (let t = 0; t <= 1; t += 0.01) {
    expect(easeInOutCubic(t)).toBeGreaterThanOrEqual(prev)
    prev = easeInOutCubic(t)
  }
})

test('flyToDistance is four radii with a 50 m floor', () => {
  expect(flyToDistance(6371)).toBe(25484)
  expect(flyToDistance(0.001)).toBe(0.05)
})

test('flight starts in place and ends at distance from the moving target', () => {
  expect(FLIGHT_MS).toBe(1200)
  const flight = createCameraFlight(camera, controls)
  const body = new THREE.Vector3(1000, 0, 0)
  flight.start(50, 0)
  expect(flight.update(body, 0)).toBe(true)
  expect(camera.position.toArray()).toEqual([0, 0, 100])
  body.set(2000, 0, 0)
  expect(flight.update(body, 1200)).toBe(false)
  expect(controls.target.toArray()).toEqual([2000, 0, 0])
  expect(camera.position.distanceTo(body)).toBeCloseTo(50, 9)
  expect(flight.active).toBe(false)
})

test('retargeting mid-flight continues from the current pose', () => {
  const flight = createCameraFlight(camera, controls)
  flight.start(50, 0)
  flight.update(new THREE.Vector3(1000, 0, 0), 600)
  const before = camera.position.clone()
  const b = new THREE.Vector3(-500, 300, 0)
  flight.start(20, 600)
  flight.update(b, 600)
  expect(camera.position.distanceTo(before)).toBeLessThan(1e-6)
})

test('followMinDistance lets the camera reach small craft but never inside a planet', () => {
  expect(followMinDistance(0.01)).toBeCloseTo(0.015, 12)
  expect(followMinDistance(0.0001)).toBe(0.002)
  expect(followMinDistance(6371)).toBe(1)
})
