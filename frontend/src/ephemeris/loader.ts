import { API_BASE } from '../api/client'
import { parseEphemSet, type EphemSet } from './sampled'

export const EPHEM_SETS = ['moons-earth', 'moons-mars', 'moons-jupiter', 'moons-saturn', 'moons-uranus', 'moons-neptune'] as const
export type EphemSetName = (typeof EPHEM_SETS)[number]

export function isEphemSetName(value: string): value is EphemSetName {
  return (EPHEM_SETS as readonly string[]).includes(value)
}

export interface LoaderDeps {
  fetch?: typeof fetch
  apiBase?: string
}

async function fetchSet(fetchFn: typeof fetch, url: string, set: string): Promise<EphemSet | null> {
  try {
    const res = await fetchFn(url)
    if (!res.ok) throw new Error(`responded ${res.status}`)
    return parseEphemSet(await res.json(), set)
  } catch (err) {
    console.warn(`ephemeris ${set} unavailable from ${url}`, err)
    return null
  }
}

export async function loadEphemSet(set: string, deps: LoaderDeps = {}): Promise<EphemSet | null> {
  if (!isEphemSetName(set)) return null
  const fetchFn = deps.fetch ?? fetch
  const apiBase = deps.apiBase ?? API_BASE
  const [staticSet, liveSet] = await Promise.all([
    fetchSet(fetchFn, `/data/ephem/${set}.json`, set),
    fetchSet(fetchFn, `${apiBase}/api/ephem/${set}`, set),
  ])
  if (staticSet && liveSet) return liveSet.generatedAtMs > staticSet.generatedAtMs ? liveSet : staticSet
  return liveSet ?? staticSet
}
