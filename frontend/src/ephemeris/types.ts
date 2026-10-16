export type Vec3 = { x: number; y: number; z: number }

export type Availability = 'exact' | 'approximate'

export const PLANET_IDS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'] as const
export const KEPLER_IDS = ['ceres', 'halley', 'encke'] as const

export type PlanetId = (typeof PLANET_IDS)[number]
export type KeplerId = (typeof KEPLER_IDS)[number]
export type EphemerisId = PlanetId | KeplerId | (string & {})

export interface OrbitalElements {
  epochJd: number
  a: number
  e: number
  i: number
  om: number
  w: number
  ma: number
  n: number
}

export const UNIX_EPOCH_JD = 2440587.5
export const MS_PER_DAY = 86_400_000

export function msToJd(utcMs: number): number {
  return utcMs / MS_PER_DAY + UNIX_EPOCH_JD
}
