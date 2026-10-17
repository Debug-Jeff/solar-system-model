import { MS_PER_DAY, UNIX_EPOCH_JD, type Vec3 } from './types'

export const EPHEM_FORMAT_VERSION = 1
const MAX_SAMPLES = 5000

export interface SampledTrack {
  center: string
  startMs: number
  stepMs: number
  count: number
  states: Float64Array
}

export interface EphemSet {
  set: string
  generatedAtMs: number
  bodies: Record<string, SampledTrack>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseTrack(id: string, raw: unknown, startMs: number): SampledTrack {
  if (!isRecord(raw)) throw new Error(`ephemeris body ${id} is not an object`)
  const { center, stepMinutes, count, states, startJd } = raw
  if (startJd !== undefined && (typeof startJd !== 'number' || !Number.isFinite(startJd))) throw new Error(`ephemeris body ${id} has a bad startJd`)
  if (typeof center !== 'string' || center === '') throw new Error(`ephemeris body ${id} has no center`)
  if (typeof stepMinutes !== 'number' || !Number.isInteger(stepMinutes) || stepMinutes <= 0) {
    throw new Error(`ephemeris body ${id} has a bad step`)
  }
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 2 || count > MAX_SAMPLES) {
    throw new Error(`ephemeris body ${id} has a bad count`)
  }
  if (!Array.isArray(states) || states.length !== count * 6) throw new Error(`ephemeris body ${id} has ${String(count)} samples but the wrong number of states`)
  const values = new Float64Array(states.length)
  for (let i = 0; i < states.length; i++) {
    const v: unknown = states[i]
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`ephemeris body ${id} has a non-finite state`)
    values[i] = v
  }
  const bodyStartMs = typeof startJd === 'number' ? (startJd - UNIX_EPOCH_JD) * MS_PER_DAY : startMs
  return { center, startMs: bodyStartMs, stepMs: stepMinutes * 60_000, count, states: values }
}

export function parseEphemSet(raw: unknown, expectedSet: string): EphemSet {
  if (!isRecord(raw)) throw new Error('ephemeris set is not an object')
  if (raw.version !== EPHEM_FORMAT_VERSION) throw new Error(`unsupported ephemeris version ${String(raw.version)}`)
  if (raw.set !== expectedSet) throw new Error(`expected set ${expectedSet}`)
  const generatedAtMs = typeof raw.generatedAt === 'string' ? Date.parse(raw.generatedAt) : Number.NaN
  if (!Number.isFinite(generatedAtMs)) throw new Error('ephemeris set has a bad generatedAt')
  if (typeof raw.startJd !== 'number' || !Number.isFinite(raw.startJd)) throw new Error('ephemeris set has a bad startJd')
  if (!isRecord(raw.bodies)) throw new Error('ephemeris set has no bodies')
  const startMs = (raw.startJd - UNIX_EPOCH_JD) * MS_PER_DAY
  const bodies: Record<string, SampledTrack> = {}
  for (const [id, body] of Object.entries(raw.bodies)) bodies[id] = parseTrack(id, body, startMs)
  return { set: expectedSet, generatedAtMs, bodies }
}

export function sampledPosition(track: SampledTrack, utcMs: number): Vec3 | null {
  const offset = (utcMs - track.startMs) / track.stepMs
  const last = track.count - 1
  if (!(offset >= 0 && offset <= last)) return null
  const i = Math.min(Math.floor(offset), last - 1)
  const t = offset - i
  const h = track.stepMs / 1000
  const s = track.states
  const a = i * 6
  const b = a + 6
  const t2 = t * t
  const t3 = t2 * t
  const h00 = 2 * t3 - 3 * t2 + 1
  const h10 = t3 - 2 * t2 + t
  const h01 = -2 * t3 + 3 * t2
  const h11 = t3 - t2
  const at = (k: number) =>
    h00 * s[a + k]! + h10 * h * s[a + 3 + k]! + h01 * s[b + k]! + h11 * h * s[b + 3 + k]!
  return { x: at(0), y: at(1), z: at(2) }
}
