import * as THREE from 'three'
import { expect, test } from 'vitest'
import { raDecToScene } from '../sky/sky'
import { createMilkyWay, milkyWayBasis } from './milkyWay'

const local = (u: number, v: number) => {
  const phi = u * Math.PI * 2
  const theta = (1 - v) * Math.PI
  return new THREE.Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta))
}
const toScene = (p: THREE.Vector3) => p.clone().applyMatrix4(milkyWayBasis())

test('the Milky Way image lands on the sky where our catalogue stars are', () => {
  expect(toScene(local(0.5, 0.5)).angleTo(raDecToScene(0, 0, new THREE.Vector3()))).toBeLessThan(1e-9)
  expect(toScene(local(0.75, 0.5)).angleTo(raDecToScene(270, 0, new THREE.Vector3()))).toBeLessThan(1e-9)
  expect(toScene(local(0.25, 0.5)).angleTo(raDecToScene(90, 0, new THREE.Vector3()))).toBeLessThan(1e-9)
  expect(toScene(local(0.5, 1)).angleTo(raDecToScene(0, 90, new THREE.Vector3()))).toBeLessThan(1e-6)
  const u = 0.5 - 266.4 / 360 + 1
  const v = 0.5 + -28.9 / 180
  expect(toScene(local(u, v)).angleTo(raDecToScene(266.4, -28.9, new THREE.Vector3()))).toBeLessThan(1e-9)
})

test('the background sits behind the stars, follows the camera and draws first', () => {
  const scene = new THREE.Scene()
  const sky = createMilkyWay(scene, new THREE.Texture())
  const camera = new THREE.PerspectiveCamera()
  camera.position.set(1e8, 2e3, -5)
  sky.update(camera)
  sky.mesh.updateMatrixWorld()
  expect(new THREE.Vector3().setFromMatrixPosition(sky.mesh.matrixWorld).distanceTo(camera.position)).toBeLessThan(1e-6)
  expect(sky.mesh.renderOrder).toBeLessThan(-1)
  const material = sky.mesh.material as THREE.MeshBasicMaterial
  expect(material.depthWrite).toBe(false)
  expect(material.side).toBe(THREE.DoubleSide)
  sky.dispose()
  expect(scene.children).not.toContain(sky.mesh)
})

test('the sky stays hidden until a texture arrives, then swaps in sharper ones', () => {
  const sky = createMilkyWay(new THREE.Scene())
  const material = sky.mesh.material as THREE.MeshBasicMaterial
  expect(material.visible).toBe(false)
  const low = new THREE.Texture()
  sky.setTexture(low)
  expect(material.visible).toBe(true)
  const high = new THREE.Texture()
  sky.setTexture(high)
  expect(material.map).toBe(high)
})
