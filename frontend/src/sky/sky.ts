import * as THREE from 'three'

const DEG = Math.PI / 180
const COS_EPS = Math.cos(23.4392911 * DEG)
const SIN_EPS = Math.sin(23.4392911 * DEG)
const MAX_STARS = 10_000
const ABBR_RE = /^[A-Z][A-Za-z]{2}$/
const WHITE_MIX = 0.4

export interface SkyData {
  stars: Float32Array
  count: number
  constellations: Map<string, Uint16Array>
}

type Rec = Record<string, unknown>
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)

export function parseSkyFile(raw: unknown): SkyData {
  if (!isRecord(raw) || raw.version !== 1) throw new Error('unsupported sky file')
  const stars = raw.stars
  if (!Array.isArray(stars) || stars.length % 4 !== 0 || stars.length > MAX_STARS * 4) throw new Error('bad star list')
  if (!stars.every((v) => typeof v === 'number' && Number.isFinite(v))) throw new Error('non-finite star value')
  const count = stars.length / 4
  if (!isRecord(raw.constellations)) throw new Error('bad constellations')
  const constellations = new Map<string, Uint16Array>()
  for (const [abbr, pairs] of Object.entries(raw.constellations)) {
    if (!ABBR_RE.test(abbr) || !Array.isArray(pairs) || pairs.length % 2 !== 0) throw new Error(`bad constellation ${abbr}`)
    if (!pairs.every((i) => Number.isInteger(i) && i >= 0 && i < count)) throw new Error(`bad star index in ${abbr}`)
    constellations.set(abbr, Uint16Array.from(pairs as number[]))
  }
  return { stars: Float32Array.from(stars as number[]), count, constellations }
}

export function raDecToScene(raDeg: number, decDeg: number, target: THREE.Vector3): THREE.Vector3 {
  const ra = raDeg * DEG
  const dec = decDeg * DEG
  const x = Math.cos(dec) * Math.cos(ra)
  const y = Math.cos(dec) * Math.sin(ra)
  const z = Math.sin(dec)
  const yEcl = y * COS_EPS + z * SIN_EPS
  const zEcl = -y * SIN_EPS + z * COS_EPS
  return target.set(x, zEcl, -yEcl)
}

function channel(v: number): number {
  return Math.min(1, Math.max(0, v / 255))
}

export function bvToRgb(bv: number): [number, number, number] {
  const b = Math.min(2, Math.max(-0.4, bv))
  const t = (4600 * (1 / (0.92 * b + 1.7) + 1 / (0.92 * b + 0.62))) / 100
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592)
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492)
  const bl = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307
  const mix = (c: number) => channel(c) * (1 - WHITE_MIX) + WHITE_MIX
  return [mix(r), mix(g), mix(bl)]
}

export function starSizePx(vmag: number): number {
  return Math.min(4, Math.max(0.8, 2.6 * Math.pow(10, -0.2 * (vmag - 1))))
}

export function starAlpha(vmag: number): number {
  return Math.min(1, Math.max(0.12, Math.pow(10, -0.4 * (vmag - 2))))
}

export async function loadSky(fetchFn: typeof fetch = fetch): Promise<SkyData | null> {
  try {
    const res = await fetchFn('/data/sky.json')
    if (!res.ok) throw new Error(`responded ${res.status}`)
    return parseSkyFile(await res.json())
  } catch (err) {
    console.warn('star catalogue unavailable; keeping a plain sky', err)
    return null
  }
}
