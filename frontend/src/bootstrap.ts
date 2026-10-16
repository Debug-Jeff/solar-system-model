import type { EngineHandle } from './engine/engine'
import type { AppStore } from './state/store'
import type { Body } from './types/body'

export const DEV_LOAD_ERROR = 'Failed to load — is the backend running on :8080?'
export const PROD_LOAD_ERROR = 'Failed to load the solar system. Please try again later.'

export interface StartDeps {
  store: AppStore
  fetchPlanets: () => Promise<Body[]>
  createEngine: (store: AppStore) => EngineHandle
  isDev: boolean
}

export async function startApp({ store, fetchPlanets, createEngine, isDev }: StartDeps): Promise<void> {
  try {
    store.getState().setBodies(await fetchPlanets())
    createEngine(store)
  } catch (err) {
    console.error('Failed to start solar system:', err)
    store.getState().setLoading({ error: isDev ? DEV_LOAD_ERROR : PROD_LOAD_ERROR })
  }
}
