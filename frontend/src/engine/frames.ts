import type * as THREE from 'three'
import type { Vec3 } from '../ephemeris'

export const AU_KM = 149_597_870.7

export function eclipticKmToScene(v: Vec3, out: THREE.Vector3): THREE.Vector3 {
  return out.set(v.x * AU_KM, v.z * AU_KM, -v.y * AU_KM)
}
