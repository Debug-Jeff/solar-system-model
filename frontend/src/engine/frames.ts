import type * as THREE from 'three'
import type { Vec3 } from '../ephemeris'

export function eclipticToScene(v: Vec3, out: THREE.Vector3): THREE.Vector3 {
  return out.set(v.x, v.z, -v.y)
}

export function compressRadial(v: Vec3, distanceFn: (au: number) => number): Vec3 {
  const r = Math.hypot(v.x, v.y, v.z)
  if (r === 0) return { x: 0, y: 0, z: 0 }
  const k = distanceFn(r) / r
  return { x: v.x * k, y: v.y * k, z: v.z * k }
}

export const AU_KM = 149_597_870.7

export function eclipticKmToScene(v: Vec3, out: THREE.Vector3): THREE.Vector3 {
  return out.set(v.x * AU_KM, v.z * AU_KM, -v.y * AU_KM)
}
