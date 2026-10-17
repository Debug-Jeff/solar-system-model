import { API_BASE } from '../api/client'
import { BACKEND_TIMEOUT_MS } from '../ephemeris/loader'
import { parseSatellitesFile, type SatellitesFile } from './store'

export interface SatelliteLoaderDeps {
  fetch?: typeof fetch
  apiBase?: string
  onUpdate?: (file: SatellitesFile) => void
}

async function fetchFile(fetchFn: typeof fetch, url: string, signal?: AbortSignal): Promise<SatellitesFile | null> {
  try {
    const res = await fetchFn(url, signal ? { signal } : undefined)
    if (!res.ok) throw new Error(`responded ${res.status}`)
    return parseSatellitesFile(await res.json())
  } catch (err) {
    console.warn(`satellites unavailable from ${url}`, err)
    return null
  }
}

export async function loadSatellites(deps: SatelliteLoaderDeps = {}): Promise<SatellitesFile | null> {
  const fetchFn = deps.fetch ?? fetch
  const apiBase = deps.apiBase ?? API_BASE
  const live = fetchFile(fetchFn, `${apiBase}/api/satellites`, AbortSignal.timeout(BACKEND_TIMEOUT_MS))
  const staticFile = await fetchFile(fetchFn, '/data/satellites.json')
  if (!staticFile) return live
  void live.then((liveFile) => {
    if (liveFile && liveFile.generatedAtMs > staticFile.generatedAtMs) deps.onUpdate?.(liveFile)
  })
  return staticFile
}
