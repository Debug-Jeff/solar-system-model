import * as THREE from 'three'
import { expect, test } from 'vitest'
import { bvToRgb, parseSkyFile, raDecToScene } from '../sky/sky'
import { createSky, SKY_RADIUS_KM } from './sky'

const data = parseSkyFile({
  version: 1,
  attribution: 'x',
  stars: [101.287, -16.716, -1.46, 0, 37.95, 89.26, 2.02, 0.6, 88.79, 7.41, 0.5, 1.85],
  constellations: { UMi: [0, 1], Ori: [1, 2, 2, 0] },
})

test('stars sit on the sky sphere as one point cloud; constellation lines start hidden', () => {
  const scene = new THREE.Scene()
  const sky = createSky(scene, data)
  const pos = sky.points.geometry.getAttribute('position')
  expect(pos.count).toBe(3)
  for (let i = 0; i < pos.count; i++) {
    expect(new THREE.Vector3().fromBufferAttribute(pos, i).length() / SKY_RADIUS_KM).toBeCloseTo(1, 5)
  }
  expect(sky.lines.geometry.getAttribute('position').count).toBe(6)
  expect(sky.lines.visible).toBe(false)
  sky.setConstellations(true)
  expect(sky.lines.visible).toBe(true)
  expect(scene.children).toContain(sky.points)
  expect(scene.children).toContain(sky.lines)
})

test('the sky follows the camera so stars stay at infinity', () => {
  const sky = createSky(new THREE.Scene(), data)
  const camera = new THREE.PerspectiveCamera()
  camera.position.set(4.5e9, -2e3, 7)
  sky.update(camera)
  expect(sky.points.position.equals(camera.position)).toBe(true)
  expect(sky.lines.position.equals(camera.position)).toBe(true)
})

test('dispose takes the sky out of the scene', () => {
  const scene = new THREE.Scene()
  const sky = createSky(scene, data)
  sky.dispose()
  expect(scene.children).not.toContain(sky.points)
  expect(scene.children).not.toContain(sky.lines)
})

test('star colours go to the GPU as linear values and the sky is not mirrored', () => {
  const sky = createSky(new THREE.Scene(), data)
  const color = sky.points.geometry.getAttribute('aColor')
  const want = new THREE.Color().setRGB(...bvToRgb(1.85), THREE.SRGBColorSpace)
  expect(color.getX(2)).toBeCloseTo(want.r, 5)
  expect(color.getZ(2)).toBeCloseTo(want.b, 5)
  const east = raDecToScene(90, 0, new THREE.Vector3())
  const north = raDecToScene(0, 90, new THREE.Vector3())
  expect(new THREE.Vector3().crossVectors(east, north).dot(raDecToScene(0, 0, new THREE.Vector3()))).toBeCloseTo(1, 9)
})

test('the served attribution carries the licence link and says the data was converted', async () => {
  const sky = (await import('../../public/data/sky.json')).default
  expect(sky.attribution).toContain('https://creativecommons.org/licenses/by/4.0/')
  expect(sky.attribution).toMatch(/converted/i)
})
