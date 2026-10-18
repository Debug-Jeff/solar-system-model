import * as THREE from 'three'
import { afterEach, expect, test, vi } from 'vitest'
import { createModelLoader, normalizeModel, type ModelManifest } from './models'

afterEach(() => vi.restoreAllMocks())

const manifest: ModelManifest = { version: 1, models: { iss: { file: 'models/iss.glb', credit: 'NASA 3D Resources' }, hubble: { file: 'models/iss.glb', credit: 'NASA 3D Resources' } } }
const box = () => new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), new THREE.MeshStandardMaterial())

test('a model is centred and scaled so its largest dimension is the craft size', () => {
  const group = normalizeModel(box(), 0.109)
  const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3())
  expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(0.109, 9)
  expect(new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3()).length()).toBeLessThan(1e-9)
})

test('each file loads once, craft sharing a file get their own copy, unknown craft load nothing', async () => {
  const load = vi.fn(async () => box())
  const models = createModelLoader(load, manifest)
  const [a, b, c] = await Promise.all([models.request('iss', 0.1), models.request('iss', 0.1), models.request('hubble', 0.013)])
  expect(load).toHaveBeenCalledTimes(1)
  expect(a).not.toBeNull()
  expect(c).not.toBe(a)
  expect(b).toBe(a)
  expect(await models.request('voyager-9', 0.01)).toBeNull()
  expect(models.has('iss')).toBe(true)
  expect(models.has('voyager-9')).toBe(false)
})

test('a failed load warns once and resolves null without retrying', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const load = vi.fn(async () => {
    throw new Error('404')
  })
  const models = createModelLoader(load, manifest)
  expect(await models.request('iss', 0.1)).toBeNull()
  expect(await models.request('iss', 0.1)).toBeNull()
  expect(load).toHaveBeenCalledTimes(1)
  expect(warn).toHaveBeenCalledTimes(1)
})

test('a model that cannot be normalised resolves null instead of rejecting', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const broken = { clone: () => { throw new Error('bad node') } } as unknown as THREE.Object3D
  const models = createModelLoader(async () => broken, manifest)
  await expect(models.request('iss', 0.1)).resolves.toBeNull()
  expect(warn).toHaveBeenCalledOnce()
})
