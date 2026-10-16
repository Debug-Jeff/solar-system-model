import { validateElements } from './kepler'
import type { OrbitalElements } from './types'

export const SMALL_BODY_TYPES = ['asteroid', 'comet', 'dwarfPlanet'] as const
export type SmallBodyType = (typeof SMALL_BODY_TYPES)[number]
const ID_RE = /^[a-z0-9-]{1,32}$/
const MAX_NAME = 80
const MAX_NAMED = 100
const MAX_NEOS = 50
const MAX_BELT_ROWS = 5000
export const BELT_STRIDE = 8

export interface NamedSmallBody {
  id: string
  name: string
  type: SmallBodyType
  radiusKm: number
  elements: OrbitalElements
}

export interface NeoApproach {
  id: string
  name: string
  approachMs: number
  missKm: number
  speedKmS: number
  diameterKm: number
  hazardous: boolean
  elements: OrbitalElements
}

export interface BeltData {
  count: number
  rows: Float64Array
}

export interface SmallBodiesData {
  named: NamedSmallBody[]
  neos: NeoApproach[]
  belts: { main: BeltData; kuiper: BeltData }
}

type Rec = Record<string, unknown>
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const EMPTY_BELT: BeltData = { count: 0, rows: new Float64Array(0) }

function parseElements(raw: unknown): OrbitalElements {
  if (!isRecord(raw)) throw new Error('elements missing')
  const el = { epochJd: raw.epochJd, a: raw.a, e: raw.e, i: raw.i, om: raw.om, w: raw.w, ma: raw.ma, n: raw.n }
  for (const v of Object.values(el)) if (!finite(v)) throw new Error('non-finite element')
  validateElements(el as OrbitalElements)
  return el as OrbitalElements
}

function parseName(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_NAME) throw new Error('bad name')
  return raw
}

function parseId(raw: unknown): string {
  if (typeof raw !== 'string' || !ID_RE.test(raw)) throw new Error('bad id')
  return raw
}

function parseNamed(raw: unknown): NamedSmallBody {
  if (!isRecord(raw)) throw new Error('not an object')
  const type = raw.type
  if (typeof type !== 'string' || !(SMALL_BODY_TYPES as readonly string[]).includes(type)) throw new Error('bad type')
  if (!finite(raw.radiusKm) || raw.radiusKm <= 0) throw new Error('bad radius')
  return { id: parseId(raw.id), name: parseName(raw.name), type: type as SmallBodyType, radiusKm: raw.radiusKm, elements: parseElements(raw.elements) }
}

function parseNeo(raw: unknown): NeoApproach {
  if (!isRecord(raw)) throw new Error('not an object')
  const { approachMs, missKm, speedKmS, diameterKm, hazardous } = raw
  if (!finite(approachMs) || !finite(missKm) || !finite(speedKmS) || !finite(diameterKm) || typeof hazardous !== 'boolean') {
    throw new Error('bad approach data')
  }
  return { id: parseId(raw.id), name: parseName(raw.name), approachMs, missKm, speedKmS, diameterKm, hazardous, elements: parseElements(raw.elements) }
}

function parseList<T>(raw: unknown, max: number, parse: (v: unknown) => T, kind: string): T[] {
  if (!Array.isArray(raw)) return []
  const out: T[] = []
  let dropped = 0
  for (const item of raw) {
    if (out.length === max) {
      dropped++
      continue
    }
    try {
      out.push(parse(item))
    } catch {
      dropped++
    }
  }
  if (dropped > 0) console.warn(`small bodies: dropped ${dropped} ${kind}`)
  return out
}

function parseBelt(raw: unknown, name: string): BeltData {
  if (!isRecord(raw) || !finite(raw.count) || !Array.isArray(raw.rows)) return EMPTY_BELT
  const { count, rows } = raw
  if (!Number.isInteger(count) || count < 0 || count > MAX_BELT_ROWS || rows.length !== count * BELT_STRIDE || !rows.every(finite)) {
    console.warn(`small bodies: rejected ${name} belt`)
    return EMPTY_BELT
  }
  return { count, rows: Float64Array.from(rows as number[]) }
}

export function parseSmallBodies(raw: unknown): SmallBodiesData {
  if (!isRecord(raw) || raw.version !== 1) throw new Error('unsupported small-bodies file')
  const belts = isRecord(raw.belts) ? raw.belts : {}
  return {
    named: parseList(raw.named, MAX_NAMED, parseNamed, 'named bodies'),
    neos: parseList(raw.neos, MAX_NEOS, parseNeo, 'near-Earth objects'),
    belts: { main: parseBelt(belts.main, 'main'), kuiper: parseBelt(belts.kuiper, 'kuiper') },
  }
}

export async function loadSmallBodies(fetchFn: typeof fetch = fetch): Promise<SmallBodiesData | null> {
  try {
    const res = await fetchFn('/data/smallbodies.json')
    if (!res.ok) throw new Error(`responded ${res.status}`)
    return parseSmallBodies(await res.json())
  } catch (err) {
    console.warn('small bodies unavailable', err)
    return null
  }
}
