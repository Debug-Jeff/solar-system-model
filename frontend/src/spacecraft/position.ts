import { heliocentricEcliptic, type Vec3 } from '../ephemeris'
import { moonPosition } from '../ephemeris/moonStore'

const AU_KM = 149_597_870.7

export function bodyHelioKm(parent: string | undefined, id: string, utcMs: number): Vec3 | null {
  const rel = moonPosition(id, utcMs)
  if (!rel) return null
  if (!parent || parent === 'sun') return rel
  const c = heliocentricEcliptic(parent, utcMs)
  return { x: rel.x + c.x * AU_KM, y: rel.y + c.y * AU_KM, z: rel.z + c.z * AU_KM }
}

export function distanceKm(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

export function earthHelioKm(utcMs: number): Vec3 {
  const e = heliocentricEcliptic('earth', utcMs)
  return { x: e.x * AU_KM, y: e.y * AU_KM, z: e.z * AU_KM }
}
