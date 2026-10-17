import rawElements from './data/smallBodyElements.json'
import { elementsOrbitPoints, elementsPosition, periodDays, validateElements } from './kepler'
import { knowsMoon, moonAvailability } from './moonStore'
import { knowsSatellite, satelliteAvailability } from '../satellites/store'
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

export type KeplerKind = 'asteroid' | 'comet' | 'dwarfPlanet' | 'neo'
const EXACT_WINDOW_DAYS: Record<KeplerKind, number> = { asteroid: 10 * 365.25, dwarfPlanet: 10 * 365.25, neo: 365.25, comet: 0 }
const SEED_KINDS: Record<KeplerId, KeplerKind> = { ceres: 'dwarfPlanet', halley: 'comet', encke: 'comet' }

interface KeplerEntry {
  elements: OrbitalElements
  kind: KeplerKind
}

const registry = new Map<string, KeplerEntry>()

export function resetKeplerRegistry(): void {
  registry.clear()
  const seeded = loadElements(rawElements)
  for (const id of KEPLER_IDS) {
    const el = seeded[id]
    if (el) registry.set(id, { elements: el, kind: SEED_KINDS[id] })
  }
}

resetKeplerRegistry()

export function registerKeplerBody(id: string, elements: OrbitalElements, kind: KeplerKind): void {
  try {
    validateElements(elements)
    registry.set(id, { elements, kind })
  } catch (err) {
    console.error(`refusing orbital elements for ${id}`, err)
  }
}

function elementsFor(id: string): OrbitalElements {
  const entry = registry.get(id)
  if (!entry) throw new Error(`no orbital elements for ${id}`)
  return entry.elements
}

function isPlanet(id: string): id is PlanetId {
  return (PLANET_IDS as readonly string[]).includes(id)
}

export function hasEphemeris(id: string): id is EphemerisId {
  return isPlanet(id) || registry.has(id)
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
  if (knowsMoon(id)) return moonAvailability(id, utcMs)
  if (knowsSatellite(id)) return satelliteAvailability(id, utcMs) ?? 'approximate'
  const entry = registry.get(id)
  if (!entry || entry.kind === 'comet') return 'approximate'
  return Math.abs(msToJd(utcMs) - entry.elements.epochJd) <= EXACT_WINDOW_DAYS[entry.kind] ? 'exact' : 'approximate'
}
