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

const randomDir = (rand: () => number) => new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize()

// A crater is a bowl with a raised rim: depth below the surface inside its angular radius, a small bump just outside.
function craterProfile(angle: number, radius: number): number {
  const r = angle / radius
  if (r < 1) return r * r - 1
  if (r < 1.5) return 0.25 * Math.cos((r - 1) * Math.PI) * (1.5 - r) * 2
  return 0
}

export function rockGeometry(id: string): THREE.BufferGeometry {
  const cached = cache.get(id)
  if (cached) return cached
  const rand = rng(seedOf(id))
  const lumps = Array.from({ length: 9 }, () => ({ dir: randomDir(rand), depth: 0.07 + rand() * 0.13, width: 0.35 + rand() * 0.6 }))
  const craters = Array.from({ length: 22 }, () => ({ dir: randomDir(rand), radius: 0.08 + Math.pow(rand(), 2) * 0.32, depth: 0.03 + rand() * 0.05 }))
  const stretch = new THREE.Vector3(1, 0.72 + rand() * 0.2, 0.64 + rand() * 0.2)
  const geometry = mergeVertices(new THREE.IcosahedronGeometry(1, 5).deleteAttribute('normal').deleteAttribute('uv'))
  const pos = geometry.getAttribute('position')
  const shade = new Float32Array(pos.count * 3)
  const v = new THREE.Vector3()
  let largest = 0
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize()
    let r = 1
    for (const lump of lumps) {
      const d = 1 - v.dot(lump.dir)
      r -= lump.depth * Math.exp(-(d * d) / (lump.width * lump.width * 0.25))
    }
    let tone = 0.82 + 0.1 * Math.sin(v.x * 9.1 + v.y * 4.3) * Math.cos(v.z * 7.7 - v.x * 3.1)
    for (const crater of craters) {
      const profile = craterProfile(Math.acos(Math.min(1, Math.max(-1, v.dot(crater.dir)))), crater.radius)
      r += crater.depth * profile
      tone += profile < 0 ? 0.12 * profile : 0.25 * profile
    }
    tone = Math.min(1, Math.max(0.45, tone))
    shade.set([tone, tone, tone], i * 3)
    v.multiplyScalar(r).multiply(stretch)
    largest = Math.max(largest, v.length())
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(shade, 3))
  geometry.scale(1 / largest, 1 / largest, 1 / largest)
  const flat = geometry.toNonIndexed()
  flat.computeVertexNormals()
  cache.set(id, flat)
  return flat
}
