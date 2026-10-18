import * as THREE from 'three'
import bundledManifest from '../../public/models/manifest.json'

export interface ModelManifest {
  version: number
  models: Record<string, { file: string; credit: string }>
}

export type LoadModel = (url: string) => Promise<THREE.Object3D>

export interface ModelLoader {
  has(id: string): boolean
  request(id: string, sizeKm: number): Promise<THREE.Object3D | null>
}

export function normalizeModel(object: THREE.Object3D, sizeKm: number): THREE.Group {
  const bounds = new THREE.Box3().setFromObject(object)
  const size = bounds.getSize(new THREE.Vector3())
  const largest = Math.max(size.x, size.y, size.z)
  object.position.sub(bounds.getCenter(new THREE.Vector3()))
  const group = new THREE.Group()
  group.add(object)
  if (largest > 0) group.scale.setScalar(sizeKm / largest)
  return group
}

export function createModelLoader(load: LoadModel, manifest: ModelManifest = bundledManifest): ModelLoader {
  const files = new Map<string, Promise<THREE.Object3D | null>>()
  const craft = new Map<string, Promise<THREE.Object3D | null>>()
  const loadFile = (file: string) => {
    let pending = files.get(file)
    if (!pending) {
      pending = load(`/${file}`).catch((err: unknown) => {
        console.warn(`3D model unavailable: ${file}`, err)
        return null
      })
      files.set(file, pending)
    }
    return pending
  }
  return {
    has: (id) => id in manifest.models,
    request(id, sizeKm) {
      const entry = manifest.models[id]
      if (!entry) return Promise.resolve(null)
      let pending = craft.get(id)
      if (!pending) {
        pending = loadFile(entry.file)
          .then((source) => (source ? normalizeModel(source.clone(true), sizeKm) : null))
          .catch((err: unknown) => {
            console.warn(`3D model could not be prepared: ${id}`, err)
            return null
          })
        craft.set(id, pending)
      }
      return pending
    },
  }
}

export function gltfLoad(): LoadModel {
  return async (url) => {
    const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
      import('three/examples/jsm/loaders/GLTFLoader.js'),
      import('three/examples/jsm/libs/meshopt_decoder.module.js'),
    ])
    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)
    return (await loader.loadAsync(url)).scene
  }
}
