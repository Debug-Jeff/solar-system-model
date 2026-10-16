import rawElements from './data/smallBodyElements.json'
import { elementsPosition, periodDays, validateElements } from './kepler'
import { PLANET_PERIOD_DAYS, planetPosition } from './planets'
import {
  KEPLER_IDS,
  MS_PER_DAY,
  PLANET_IDS,
  msToJd,
  type Availability,
  type EphemerisId,
  type KeplerId,
  type OrbitalElements,
  type PlanetId,
  type Vec3,
} from './types'

export { elementsPosition, validateElements } from './kepler'
export * from './types'

export const MIN_EPHEMERIS_MS = Date.UTC(1900, 0, 1)
export const MAX_EPHEMERIS_MS = Date.UTC(2050, 11, 31, 23, 59, 59)
const CERES_EXACT_WINDOW_DAYS = 10 * 365.25

const ELEMENTS: Record<KeplerId, OrbitalElements> = (() => {
  const source = rawElements as Record<string, OrbitalElements | undefined>
  const out = {} as Record<KeplerId, OrbitalElements>
  for (const id of KEPLER_IDS) {
    const el = source[id]
    if (!el) throw new Error(`missing orbital elements for ${id}`)
    validateElements(el)
    out[id] = el
  }
  return out
})()

function isPlanet(id: string): id is PlanetId {
  return (PLANET_IDS as readonly string[]).includes(id)
}

export function hasEphemeris(id: string): id is EphemerisId {
  return isPlanet(id) || (KEPLER_IDS as readonly string[]).includes(id)
}

export function heliocentricEcliptic(id: EphemerisId, utcMs: number): Vec3 {
  return isPlanet(id) ? planetPosition(id, utcMs) : elementsPosition(ELEMENTS[id], utcMs)
}

export function orbitPeriodDays(id: EphemerisId): number {
  return isPlanet(id) ? PLANET_PERIOD_DAYS[id] : periodDays(ELEMENTS[id])
}

export function orbitPath(id: EphemerisId, utcMs: number, segments = 360): Vec3[] {
  const periodMs = orbitPeriodDays(id) * MS_PER_DAY
  const start = utcMs - periodMs / 2
  const points: Vec3[] = []
  for (let i = 0; i < segments; i++) points.push(heliocentricEcliptic(id, start + (periodMs * i) / segments))
  const first = points[0]
  if (first) points.push({ ...first })
  return points
}

export function availability(id: string, utcMs: number): Availability {
  if (utcMs < MIN_EPHEMERIS_MS || utcMs > MAX_EPHEMERIS_MS) return 'approximate'
  if (isPlanet(id)) return 'exact'
  if (id === 'ceres') {
    return Math.abs(msToJd(utcMs) - ELEMENTS.ceres.epochJd) <= CERES_EXACT_WINDOW_DAYS ? 'exact' : 'approximate'
  }
  return 'approximate'
}
