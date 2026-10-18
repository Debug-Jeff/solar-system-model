import type { EngineHandle } from './engine/engine'
import { viewBridge } from './engine/viewBridge'
import { parseShareLink } from './state/shareLink'
import type { AppStore } from './state/store'
import type { SmallBodiesData } from './ephemeris/smallBodies'
import { appendUnique, mergeSmallBodies } from './smallBodyRecords'
import { satelliteRecords } from './satellites/catalogue'
import { spacecraftRecords } from './spacecraft/catalogue'
import type { Body } from './types/body'

export const DEV_LOAD_ERROR = 'Failed to load — is the backend running on :8080?'
export const PROD_LOAD_ERROR = 'Failed to load the solar system. Please try again later.'

export interface StartDeps {
  store: AppStore
  fetchPlanets: () => Promise<Body[]>
  fetchSmallBodies?: () => Promise<SmallBodiesData | null>
  createEngine: (store: AppStore, smallBodies: SmallBodiesData | null) => EngineHandle
  isDev: boolean
  shareSearch?: string
}

export async function startApp({ store, fetchPlanets, fetchSmallBodies, createEngine, isDev, shareSearch }: StartDeps): Promise<void> {
  try {
    const [planets, small] = await Promise.all([fetchPlanets(), fetchSmallBodies ? fetchSmallBodies().catch(() => null) : null])
    const withSmall = small ? mergeSmallBodies(planets, small) : planets
    store.getState().setBodies(appendUnique(withSmall, [...spacecraftRecords(), ...satelliteRecords()]))
    createEngine(store, small)
    const view = shareSearch ? parseShareLink(shareSearch, new Set(store.getState().bodies.map((b) => b.id))) : null
    if (view?.simTimeMs != null) store.getState().setSimTimeMs(view.simTimeMs)
    if (view?.bodyId) {
      if (view.offsetKm) viewBridge.setPending({ bodyId: view.bodyId, offsetKm: view.offsetKm })
      store.getState().select(view.bodyId)
    }
  } catch (err) {
    console.error('Failed to start solar system:', err)
    store.getState().setLoading({ error: isDev ? DEV_LOAD_ERROR : PROD_LOAD_ERROR })
  }
}
