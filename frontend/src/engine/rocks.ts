import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const cache = new Map<string, THREE.BufferGeometry>()

function seedOf(id: string): number {
  let h = 2166136261
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}

function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), s | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function rockGeometry(id: string): THREE.BufferGeometry {
  const cached = cache.get(id)
  if (cached) return cached
  const rand = rng(seedOf(id))
  const lumps = Array.from({ length: 9 }, () => ({
    dir: new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize(),
    depth: 0.07 + rand() * 0.13,
    width: 0.35 + rand() * 0.6,
  }))
  const stretch = new THREE.Vector3(1, 0.72 + rand() * 0.2, 0.64 + rand() * 0.2)
  const geometry = mergeVertices(new THREE.IcosahedronGeometry(1, 4).deleteAttribute('normal').deleteAttribute('uv'))
  const pos = geometry.getAttribute('position')
  const v = new THREE.Vector3()
  let largest = 0
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize()
    let r = 1
    for (const lump of lumps) {
      const d = 1 - v.dot(lump.dir)
      r -= lump.depth * Math.exp(-(d * d) / (lump.width * lump.width * 0.25))
    }
    v.multiplyScalar(r).multiply(stretch)
    largest = Math.max(largest, v.length())
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  geometry.scale(1 / largest, 1 / largest, 1 / largest)
  const flat = geometry.toNonIndexed()
  flat.computeVertexNormals()
  cache.set(id, flat)
  return flat
}
