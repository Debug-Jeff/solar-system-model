import { useStore } from 'zustand'
import type { AppActions, AppState, AppStore } from '../state/store'

export function useAppStore<T>(store: AppStore, selector: (s: AppState & AppActions) => T): T {
  return useStore(store, selector)
}

export interface StoreProps {
  store: AppStore
}
