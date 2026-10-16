import rawElements from './data/smallBodyElements.json'
import { elementsOrbitPoints, elementsPosition, periodDays, validateElements } from './kepler'
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

function isKeplerId(id: string): id is KeplerId {
  return (KEPLER_IDS as readonly string[]).includes(id)
}

export function loadElements(raw: unknown): Partial<Record<KeplerId, OrbitalElements>> {
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const out: Partial<Record<KeplerId, OrbitalElements>> = {}
  for (const id of KEPLER_IDS) {
    const el = source[id]
    try {
      if (typeof el !== 'object' || el === null) throw new Error('missing')
      validateElements(el as OrbitalElements)
      out[id] = el as OrbitalElements
    } catch (err) {
      console.error(`dropping orbital elements for ${id}`, err)
    }
  }
  return out
}

const ELEMENTS = loadElements(rawElements)

function elementsFor(id: KeplerId): OrbitalElements {
  const el = ELEMENTS[id]
  if (!el) throw new Error(`no orbital elements for ${id}`)
  return el
}

function isPlanet(id: string): id is PlanetId {
  return (PLANET_IDS as readonly string[]).includes(id)
}

export function hasEphemeris(id: string): id is EphemerisId {
  return isPlanet(id) || (isKeplerId(id) && ELEMENTS[id] !== undefined)
}

export function heliocentricEcliptic(id: EphemerisId, utcMs: number): Vec3 {
  return isPlanet(id) ? planetPosition(id, utcMs) : elementsPosition(elementsFor(id), utcMs)
}

export function orbitPeriodDays(id: EphemerisId): number {
  return isPlanet(id) ? PLANET_PERIOD_DAYS[id] : periodDays(elementsFor(id))
}

export function orbitPath(id: EphemerisId, utcMs: number, segments = 360): Vec3[] {
  if (!isPlanet(id)) return elementsOrbitPoints(elementsFor(id), segments)
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
  if (id === 'sun' || isPlanet(id)) return 'exact'
  if (id === 'ceres') {
    const ceres = ELEMENTS.ceres
    return ceres && Math.abs(msToJd(utcMs) - ceres.epochJd) <= CERES_EXACT_WINDOW_DAYS ? 'exact' : 'approximate'
  }
  return 'approximate'
}
