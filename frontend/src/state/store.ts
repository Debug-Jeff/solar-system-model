import { createStore, type StoreApi } from 'zustand/vanilla'
import type { Body } from '../types/body'

export const BASE_SIM_HOURS_PER_SECOND = 24
export const SIM_START_MS = Date.UTC(2026, 9, 16)
export const MIN_JUMP_YEAR = 1900
export const MAX_JUMP_YEAR = 2050
const MAX_SPEED = 3
const MS_PER_HOUR = 3_600_000

export type NasaPanelContent = { title: string; imageUrl: string; caption: string }

export interface AppState {
  bodies: Body[]
  simTimeMs: number
  speed: number
  lastNonzeroSpeed: number
  selectedId: string | null
  followId: string | null
  followSeq: number
  layers: { orbits: boolean; labels: boolean; liveEarthTexture: boolean }
  nasaPanel: NasaPanelContent | null
  dateModalOpen: boolean
  loading: { active: boolean; text: string; error: string | null }
  simJumpSeq: number
  resetViewSeq: number
}

export interface AppActions {
  setBodies(bodies: Body[]): void
  advance(realSeconds: number): void
  setSpeed(speed: number): void
  togglePlay(): void
  jumpToDate(isoDate: string): boolean
  select(id: string | null): void
  stopFollow(): void
  setLayer(layer: keyof AppState['layers'], on: boolean): void
  showNasaPanel(content: NasaPanelContent): void
  closeNasaPanel(): void
  setDateModalOpen(open: boolean): void
  setLoading(patch: Partial<AppState['loading']>): void
  resetView(): void
}

export type AppStore = StoreApi<AppState & AppActions>

export function parseJumpDate(isoDate: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < MIN_JUMP_YEAR || year > MAX_JUMP_YEAR) return null
  const ms = Date.UTC(year, month - 1, day)
  const d = new Date(ms)
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null
  return ms
}

export function createAppStore(): AppStore {
  return createStore<AppState & AppActions>()((set, get) => ({
    bodies: [],
    simTimeMs: SIM_START_MS,
    speed: 1,
    lastNonzeroSpeed: 1,
    selectedId: null,
    followId: null,
    followSeq: 0,
    layers: { orbits: true, labels: true, liveEarthTexture: false },
    nasaPanel: null,
    dateModalOpen: false,
    loading: { active: true, text: 'Loading textures…', error: null },
    simJumpSeq: 0,
    resetViewSeq: 0,

    setBodies: (bodies) => set({ bodies }),
    advance: (realSeconds) =>
      set((s) => ({ simTimeMs: s.simTimeMs + realSeconds * s.speed * BASE_SIM_HOURS_PER_SECOND * MS_PER_HOUR })),
    setSpeed: (speed) => {
      const clamped = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, speed))
      set((s) => ({ speed: clamped, lastNonzeroSpeed: clamped !== 0 ? clamped : s.lastNonzeroSpeed }))
    },
    togglePlay: () => {
      const { speed, lastNonzeroSpeed } = get()
      set({ speed: speed === 0 ? lastNonzeroSpeed : 0 })
    },
    jumpToDate: (isoDate) => {
      const ms = parseJumpDate(isoDate)
      if (ms === null) return false
      set((s) => ({ simTimeMs: ms, simJumpSeq: s.simJumpSeq + 1 }))
      return true
    },
    select: (id) =>
      set((s) => (id === null ? { selectedId: null } : { selectedId: id, followId: id, followSeq: s.followSeq + 1 })),
    stopFollow: () => set({ followId: null }),
    setLayer: (layer, on) => set((s) => ({ layers: { ...s.layers, [layer]: on } })),
    showNasaPanel: (content) => set({ nasaPanel: content }),
    closeNasaPanel: () => set({ nasaPanel: null }),
    setDateModalOpen: (open) => set({ dateModalOpen: open }),
    setLoading: (patch) => set((s) => ({ loading: { ...s.loading, ...patch } })),
    resetView: () => set((s) => ({ followId: null, resetViewSeq: s.resetViewSeq + 1 })),
  }))
}
