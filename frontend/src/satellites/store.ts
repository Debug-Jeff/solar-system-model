import { json2satrec, propagate, type OMMJsonObject, type SatRec } from 'satellite.js'
import type { RotationMatrix } from 'astronomy-engine'
import { equatorOfDateToEcliptic } from '../ephemeris/earthFrame'
import type { Availability, Vec3 } from '../ephemeris/types'

const DAY_MS = 86_400_000
const EXACT_DAYS = 7
const USABLE_DAYS = 14
const MU_KM3_S2 = 398_600.4418
const MAX_SATELLITES = 64
const ID_RE = /^[a-z0-9-]{1,32}$/
const TEXT_RE = /^[\x20-\x7e]{1,40}$/
const MARKUP_RE = /[<>&"]/
const NUMERIC_FIELDS = [
  'MEAN_MOTION',
  'ECCENTRICITY',
  'INCLINATION',
  'RA_OF_ASC_NODE',
  'ARG_OF_PERICENTER',
  'MEAN_ANOMALY',
  'BSTAR',
  'MEAN_MOTION_DOT',
  'MEAN_MOTION_DDOT',
  'NORAD_CAT_ID',
  'ELEMENT_SET_NO',
] as const

export interface SatelliteOMM {
  OBJECT_NAME: string
  OBJECT_ID: string
  EPOCH: string
  MEAN_MOTION: number
  ECCENTRICITY: number
  INCLINATION: number
  RA_OF_ASC_NODE: number
  ARG_OF_PERICENTER: number
  MEAN_ANOMALY: number
  EPHEMERIS_TYPE?: number
  CLASSIFICATION_TYPE?: string
  NORAD_CAT_ID: number
  ELEMENT_SET_NO: number
  REV_AT_EPOCH?: number
  BSTAR: number
  MEAN_MOTION_DOT: number
  MEAN_MOTION_DDOT: number
}

export interface SatelliteEntry {
  id: string
  omm: SatelliteOMM
}

export interface SatellitesFile {
  version: 1
  generatedAtMs: number
  satellites: SatelliteEntry[]
}

export interface SatelliteOrbit {
  semiMajorAxisKm: number
  periodMs: number
  epochMs: number
}

interface Tracked extends SatelliteOrbit {
  satrec: SatRec
}

type Rec = Record<string, unknown>
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const isText = (v: unknown): v is string => typeof v === 'string' && TEXT_RE.test(v) && !MARKUP_RE.test(v)

function parseEntry(raw: unknown): SatelliteEntry {
  if (!isRecord(raw) || typeof raw.id !== 'string' || !ID_RE.test(raw.id) || !isRecord(raw.omm)) throw new Error('bad entry')
  const omm = raw.omm
  for (const key of NUMERIC_FIELDS) if (typeof omm[key] !== 'number' || !Number.isFinite(omm[key])) throw new Error(`bad ${key}`)
  const n = omm as unknown as SatelliteOMM
  if (!(n.MEAN_MOTION > 0 && n.MEAN_MOTION <= 20) || !(n.ECCENTRICITY >= 0 && n.ECCENTRICITY < 1) || !(n.INCLINATION >= 0 && n.INCLINATION <= 180)) {
    throw new Error('elements out of range')
  }
  if (typeof omm.EPOCH !== 'string' || !Number.isFinite(Date.parse(`${omm.EPOCH}Z`))) throw new Error('bad epoch')
  if (!isText(omm.OBJECT_NAME) || !isText(omm.OBJECT_ID)) throw new Error('bad name')
  return { id: raw.id, omm: n }
}

export function parseSatellitesFile(raw: unknown): SatellitesFile {
  if (!isRecord(raw) || raw.version !== 1) throw new Error('unsupported satellites file')
  const generatedAtMs = typeof raw.generatedAt === 'string' ? Date.parse(raw.generatedAt) : Number.NaN
  if (!Number.isFinite(generatedAtMs)) throw new Error('bad generatedAt')
  if (!Array.isArray(raw.satellites) || raw.satellites.length > MAX_SATELLITES) throw new Error('bad satellites list')
  const satellites: SatelliteEntry[] = []
  let dropped = 0
  for (const item of raw.satellites) {
    try {
      satellites.push(parseEntry(item))
    } catch {
      dropped++
    }
  }
  if (dropped > 0) console.warn(`satellites: dropped ${dropped} invalid entries`)
  return { version: 1, generatedAtMs, satellites }
}

const tracked = new Map<string, Tracked>()
const listeners = new Set<() => void>()
let currentGeneratedAtMs = Number.NEGATIVE_INFINITY

function safePropagate(satrec: SatRec, utcMs: number): { position: Vec3; velocity: Vec3 } | null {
  try {
    const pv = propagate(satrec, new Date(utcMs))
    if (!pv) return null
    const { position: p, velocity: v } = pv
    if (![p.x, p.y, p.z, v.x, v.y, v.z].every(Number.isFinite)) return null
    return { position: p, velocity: v }
  } catch {
    return null
  }
}

function rotate(r: RotationMatrix, v: Vec3): Vec3 {
  const m = r.rot
  return {
    x: m[0]![0]! * v.x + m[1]![0]! * v.y + m[2]![0]! * v.z,
    y: m[0]![1]! * v.x + m[1]![1]! * v.y + m[2]![1]! * v.z,
    z: m[0]![2]! * v.x + m[1]![2]! * v.y + m[2]![2]! * v.z,
  }
}

export function ommJson(omm: SatelliteOMM): OMMJsonObject {
  return {
    OBJECT_NAME: omm.OBJECT_NAME,
    OBJECT_ID: omm.OBJECT_ID,
    EPOCH: omm.EPOCH,
    MEAN_MOTION: omm.MEAN_MOTION,
    ECCENTRICITY: omm.ECCENTRICITY,
    INCLINATION: omm.INCLINATION,
    RA_OF_ASC_NODE: omm.RA_OF_ASC_NODE,
    ARG_OF_PERICENTER: omm.ARG_OF_PERICENTER,
    MEAN_ANOMALY: omm.MEAN_ANOMALY,
    NORAD_CAT_ID: omm.NORAD_CAT_ID,
    ELEMENT_SET_NO: omm.ELEMENT_SET_NO,
    BSTAR: omm.BSTAR,
    MEAN_MOTION_DOT: omm.MEAN_MOTION_DOT,
    MEAN_MOTION_DDOT: omm.MEAN_MOTION_DDOT,
  }
}

function track(entry: SatelliteEntry): Tracked | null {
  try {
    const satrec = json2satrec(ommJson(entry.omm))
    const epochMs = Date.parse(`${entry.omm.EPOCH}Z`)
    if (satrec.error !== 0 || !safePropagate(satrec, epochMs)) return null
    const radPerSec = satrec.no / 60
    return { satrec, epochMs, periodMs: ((2 * Math.PI) / satrec.no) * 60_000, semiMajorAxisKm: Math.cbrt(MU_KM3_S2 / (radPerSec * radPerSec)) }
  } catch {
    return null
  }
}

export function registerSatellites(file: SatellitesFile): void {
  if (file.generatedAtMs <= currentGeneratedAtMs) return
  currentGeneratedAtMs = file.generatedAtMs
  for (const entry of file.satellites) {
    const t = track(entry)
    if (t) tracked.set(entry.id, t)
  }
  for (const listener of listeners) listener()
}

export function resetSatellites(): void {
  tracked.clear()
  currentGeneratedAtMs = Number.NEGATIVE_INFINITY
}

export function onSatellitesRegistered(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function knowsSatellite(id: string): boolean {
  return tracked.has(id)
}

function usable(id: string, utcMs: number): Tracked | null {
  const t = tracked.get(id)
  return t && Math.abs(utcMs - t.epochMs) <= USABLE_DAYS * DAY_MS ? t : null
}

export function satellitePosition(id: string, utcMs: number): Vec3 | null {
  const t = usable(id, utcMs)
  const pv = t ? safePropagate(t.satrec, utcMs) : null
  return pv ? rotate(equatorOfDateToEcliptic(utcMs), pv.position) : null
}

export function satelliteVelocity(id: string, utcMs: number): Vec3 | null {
  const t = usable(id, utcMs)
  const pv = t ? safePropagate(t.satrec, utcMs) : null
  return pv ? rotate(equatorOfDateToEcliptic(utcMs), pv.velocity) : null
}

export function satelliteOrbit(id: string): SatelliteOrbit | null {
  const t = tracked.get(id)
  return t ? { semiMajorAxisKm: t.semiMajorAxisKm, periodMs: t.periodMs, epochMs: t.epochMs } : null
}

export function satelliteOrbitPath(id: string, utcMs: number, samples = 180): Vec3[] {
  const t = usable(id, utcMs)
  if (!t) return []
  const points: Vec3[] = []
  for (let i = 0; i <= samples; i++) {
    const p = satellitePosition(id, utcMs - t.periodMs / 2 + (t.periodMs * i) / samples)
    if (p) points.push(p)
  }
  return points
}

export function satelliteAvailability(id: string, utcMs: number): Availability | null {
  const t = tracked.get(id)
  if (!t) return null
  const ageDays = Math.abs(utcMs - t.epochMs) / DAY_MS
  return ageDays <= EXACT_DAYS ? 'exact' : ageDays <= USABLE_DAYS ? 'approximate' : null
}
