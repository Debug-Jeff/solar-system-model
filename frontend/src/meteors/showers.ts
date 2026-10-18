import { heliocentricEcliptic } from '../ephemeris'
import { BELT_STRIDE, type BeltData } from '../ephemeris/smallBodies'
import type { OrbitalElements } from '../ephemeris/types'

const CODE_RE = /^[A-Z]{3}$/
const TEXT_RE = /^[\x20-\x7e]{1,60}$/
const MARKUP_RE = /[<>&"]/
const MAX_SHOWERS = 40
const STREAM_PARTICLES = 600
const DEG_PER_DAY = 360 / 365.2422
const DAY_MS = 86_400_000
const K_DEG_PER_DAY = 0.9856076686
const MAX_E = 0.994

export interface Shower {
  code: string
  name: string
  parentName: string
  startLon: number
  peakLon: number
  endLon: number
  zhr: number
  speedKmS: number
  elements: OrbitalElements
}

type Rec = Record<string, unknown>
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isText = (v: unknown): v is string => typeof v === 'string' && TEXT_RE.test(v) && !MARKUP_RE.test(v)
const isLon = (v: unknown): v is number => finite(v) && v >= 0 && v < 360

function parseShower(raw: unknown): Shower {
  if (!isRecord(raw) || typeof raw.code !== 'string' || !CODE_RE.test(raw.code)) throw new Error('bad shower code')
  if (!isText(raw.name) || !isText(raw.parentName)) throw new Error('bad shower name')
  if (!isLon(raw.startLon) || !isLon(raw.peakLon) || !isLon(raw.endLon)) throw new Error('bad solar longitude')
  if (!finite(raw.zhr) || raw.zhr <= 0 || !finite(raw.speedKmS) || raw.speedKmS <= 0) throw new Error('bad rate or speed')
  const el = raw.elements
  if (!isRecord(el)) throw new Error('missing elements')
  const elements = { epochJd: el.epochJd, a: el.a, e: el.e, i: el.i, om: el.om, w: el.w, ma: el.ma, n: el.n }
  if (!Object.values(elements).every(finite)) throw new Error('non-finite elements')
  const e = elements as OrbitalElements
  if (!(e.a > 0) || !(e.e >= 0 && e.e < 0.995)) throw new Error('unbound parent orbit')
  return { code: raw.code, name: raw.name, parentName: raw.parentName, startLon: raw.startLon, peakLon: raw.peakLon, endLon: raw.endLon, zhr: raw.zhr, speedKmS: raw.speedKmS, elements: e }
}

export function parseShowersFile(raw: unknown): Shower[] {
  if (!isRecord(raw) || raw.version !== 1) throw new Error('unsupported meteor showers file')
  if (!Array.isArray(raw.showers) || raw.showers.length > MAX_SHOWERS) throw new Error('bad showers list')
  return raw.showers.map(parseShower)
}

export function solarLongitude(utcMs: number): number {
  const earth = heliocentricEcliptic('earth', utcMs)
  return ((((Math.atan2(earth.y, earth.x) * 180) / Math.PI + 180) % 360) + 360) % 360
}

export function inWindow(lon: number, start: number, end: number): boolean {
  return start <= end ? lon >= start && lon <= end : lon >= start || lon <= end
}

export function activeShowers(showers: readonly Shower[], utcMs: number): Shower[] {
  const lon = solarLongitude(utcMs)
  return showers.filter((s) => inWindow(lon, s.startLon, s.endLon)).sort((a, b) => b.zhr - a.zhr)
}

function wrap180(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180
}

export function nearestPeak(shower: Shower, utcMs: number): number {
  let t = utcMs + (wrap180(shower.peakLon - solarLongitude(utcMs)) / DEG_PER_DAY) * DAY_MS
  for (let k = 0; k < 4; k++) t += (wrap180(shower.peakLon - solarLongitude(t)) / DEG_PER_DAY) * DAY_MS
  return t
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seedOf(code: string): number {
  let h = 2166136261
  for (const ch of code) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}

export function streamBelt(shower: Shower, count = STREAM_PARTICLES): BeltData {
  const rand = mulberry32(seedOf(shower.code))
  const spread = (width: number) => (rand() * 2 - 1) * width
  const p = shower.elements
  const rows = new Float64Array(count * BELT_STRIDE)
  for (let k = 0; k < count; k++) {
    const a = p.a * (1 + spread(0.015))
    const e = Math.min(MAX_E, Math.max(0, p.e + spread(0.01)))
    rows.set(
      [a, e, p.i + spread(1.5), p.om + spread(1.5), p.w + spread(1.5), rand() * 360, K_DEG_PER_DAY / Math.pow(a, 1.5), p.epochJd],
      k * BELT_STRIDE
    )
  }
  return { count, rows }
}

export async function loadShowers(fetchFn: typeof fetch = fetch): Promise<Shower[] | null> {
  try {
    const res = await fetchFn('/data/meteor-showers.json')
    if (!res.ok) throw new Error(`responded ${res.status}`)
    return parseShowersFile(await res.json())
  } catch (err) {
    console.warn('meteor showers unavailable', err)
    return null
  }
}
