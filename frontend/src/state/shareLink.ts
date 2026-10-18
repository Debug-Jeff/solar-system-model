import { MAX_SIM_MS, MIN_SIM_MS } from './store'

export interface ShareView {
  bodyId: string | null
  simTimeMs: number | null
  offsetKm: [number, number, number] | null
}

const MAX_SEARCH_LENGTH = 512
const MIN_OFFSET_KM = 1e-4
const MAX_OFFSET_KM = 1e10

const round4 = (v: number) => Number(v.toPrecision(4))

export function encodeShareLink(view: ShareView, baseUrl: string): string {
  const url = new URL(baseUrl)
  url.search = ''
  if (view.bodyId) url.searchParams.set('o', view.bodyId)
  if (view.simTimeMs !== null) url.searchParams.set('t', new Date(Math.floor(view.simTimeMs / 1000) * 1000).toISOString().replace('.000Z', 'Z'))
  if (view.bodyId && view.offsetKm) url.searchParams.set('v', view.offsetKm.map((v) => String(round4(v))).join(','))
  return url.toString()
}

function parseTime(raw: string | null): number | null {
  if (!raw) return null
  const ms = Date.parse(raw)
  if (!Number.isFinite(ms)) return null
  return Math.min(MAX_SIM_MS, Math.max(MIN_SIM_MS, ms))
}

function parseOffset(raw: string | null): [number, number, number] | null {
  if (!raw) return null
  const parts = raw.split(',')
  if (parts.length !== 3) return null
  const v = parts.map(Number)
  if (!v.every(Number.isFinite)) return null
  const length = Math.hypot(v[0]!, v[1]!, v[2]!)
  if (length < MIN_OFFSET_KM || length > MAX_OFFSET_KM) return null
  return [v[0]!, v[1]!, v[2]!]
}

export function parseShareLink(search: string, knownIds: ReadonlySet<string>): ShareView | null {
  if (!search || search.length > MAX_SEARCH_LENGTH) return null
  const params = new URLSearchParams(search)
  const id = params.get('o')
  const bodyId = id && knownIds.has(id) ? id : null
  const simTimeMs = parseTime(params.get('t'))
  const offsetKm = bodyId ? parseOffset(params.get('v')) : null
  if (bodyId === null && simTimeMs === null) return null
  return { bodyId, simTimeMs, offsetKm }
}
