import * as THREE from 'three'
import type { Body } from '../types/body'

export const ORBIT_OPACITY = { normal: 0.45, selected: 1, moon: 0.5 }
export const COMET_ORBIT_COLOR = '#7fe0ff'
export const ASTEROID_ORBIT_COLOR = '#c9a77a'
const DEFAULT_COLOR = '#8899aa'
const DWARF_LIGHTNESS = 0.7

export interface OrbitColor {
  color: string
  opacity: number
}

function withLightness(hex: string, lightness: number): string {
  const c = new THREE.Color(hex)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  return `#${c.setHSL(hsl.h, hsl.s, lightness).getHexString()}`
}

export function orbitColor(body: Body, parent: Body | null): OrbitColor {
  const own = body.color ?? DEFAULT_COLOR
  switch (body.type) {
    case 'comet':
      return { color: COMET_ORBIT_COLOR, opacity: ORBIT_OPACITY.normal }
    case 'dwarfPlanet':
      return { color: withLightness(own, DWARF_LIGHTNESS), opacity: ORBIT_OPACITY.normal }
    case 'moon':
      return { color: parent?.color ?? own, opacity: ORBIT_OPACITY.moon }
    default:
      return { color: own, opacity: ORBIT_OPACITY.normal }
  }
}

export function relativePositions(points: readonly THREE.Vector3[], origin: THREE.Vector3): Float32Array {
  const out = new Float32Array(points.length * 3)
  points.forEach((p, i) => {
    out[i * 3] = p.x - origin.x
    out[i * 3 + 1] = p.y - origin.y
    out[i * 3 + 2] = p.z - origin.z
  })
  return out
}
