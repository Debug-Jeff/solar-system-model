import type { EngineHandle } from './engine/engine'
import type { AppStore } from './state/store'
import type { SmallBodiesData } from './ephemeris/smallBodies'
import { mergeSmallBodies } from './smallBodyRecords'
import type { Body } from './types/body'

export const DEV_LOAD_ERROR = 'Failed to load — is the backend running on :8080?'
export const PROD_LOAD_ERROR = 'Failed to load the solar system. Please try again later.'

export interface StartDeps {
  store: AppStore
  fetchPlanets: () => Promise<Body[]>
  fetchSmallBodies?: () => Promise<SmallBodiesData | null>
  createEngine: (store: AppStore) => EngineHandle
  isDev: boolean
}

export async function startApp({ store, fetchPlanets, fetchSmallBodies, createEngine, isDev }: StartDeps): Promise<void> {
  try {
    const [planets, small] = await Promise.all([fetchPlanets(), fetchSmallBodies ? fetchSmallBodies().catch(() => null) : null])
    store.getState().setBodies(small ? mergeSmallBodies(planets, small) : planets)
    createEngine(store)
  } catch (err) {
    console.error('Failed to start solar system:', err)
    store.getState().setLoading({ error: isDev ? DEV_LOAD_ERROR : PROD_LOAD_ERROR })
  }
}
