import type { Shower } from '../meteors/showers'
import { createStore, type StoreApi } from 'zustand/vanilla'
import type { Body } from '../types/body'

export const MIN_JUMP_YEAR = 1900
export const MAX_JUMP_YEAR = 2050
export const MIN_SIM_MS = Date.UTC(MIN_JUMP_YEAR, 0, 1)
export const MAX_SIM_MS = Date.UTC(MAX_JUMP_YEAR, 11, 31, 23, 59, 59)
export const RATE_STEPS: readonly number[] = [1, 60, 3600, 86_400, 604_800, 2_629_800, 31_557_600]
export const LIVE_TOLERANCE_MS = 2000

export type NasaPanelContent = { title: string; imageUrl: string; caption: string }

export interface AppState {
  clock: () => number
  bodies: Body[]
  simTimeMs: number
  rate: number
  paused: boolean
  selectedId: string | null
  followId: string | null
  followSeq: number
  layers: { orbits: boolean; labels: boolean; liveEarthTexture: boolean; constellations: boolean; meteorShowers: boolean }
  showers: Shower[]
  nasaPanel: NasaPanelContent | null
  dateModalOpen: boolean
  loading: { active: boolean; text: string; error: string | null }
  resetViewSeq: number
  zoom: { seq: number; factor: number }
  infoCollapsed: boolean
}

export interface AppActions {
  setBodies(bodies: Body[]): void
  advance(realSeconds: number): void
  togglePlay(): void
  faster(): void
  slower(): void
  reverse(): void
  goLive(): void
  resyncIfLive(wasLive: boolean): void
  jumpToDate(isoDate: string): boolean
  setSimTimeMs(ms: number): void
  select(id: string | null): void
  stopFollow(): void
  setLayer(layer: keyof AppState['layers'], on: boolean): void
  setShowers(showers: Shower[]): void
  showNasaPanel(content: NasaPanelContent): void
  closeNasaPanel(): void
  setDateModalOpen(open: boolean): void
  setLoading(patch: Partial<AppState['loading']>): void
  resetView(): void
  setRate(rate: number): void
  zoomBy(factor: number): void
  toggleInfo(): void
}

export type AppStore = StoreApi<AppState & AppActions>

export function isLive(state: Pick<AppState, 'rate' | 'paused' | 'simTimeMs'>, nowMs: number): boolean {
  return !state.paused && state.rate === 1 && Math.abs(state.simTimeMs - nowMs) < LIVE_TOLERANCE_MS
}

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

function stepRate(rate: number, direction: 1 | -1): number {
  const sign = rate < 0 ? -1 : 1
  const index = RATE_STEPS.findIndex((step) => step >= Math.abs(rate))
  const current = index === -1 ? RATE_STEPS.length - 1 : index
  const next = Math.min(RATE_STEPS.length - 1, Math.max(0, current + direction))
  return sign * RATE_STEPS[next]!
}

export function createAppStore(nowMs: () => number = Date.now): AppStore {
  return createStore<AppState & AppActions>()((set, get) => ({
    clock: nowMs,
    bodies: [],
    simTimeMs: nowMs(),
    rate: 1,
    paused: false,
    selectedId: null,
    followId: null,
    followSeq: 0,
    layers: { orbits: true, labels: true, liveEarthTexture: false, constellations: false, meteorShowers: true },
    showers: [],
    nasaPanel: null,
    dateModalOpen: false,
    loading: { active: true, text: 'Loading textures…', error: null },
    resetViewSeq: 0,
    zoom: { seq: 0, factor: 1 },
    infoCollapsed: false,

    setBodies: (bodies) => set({ bodies }),
    advance: (realSeconds) => {
      const { paused, rate, simTimeMs } = get()
      if (paused) return
      const next = simTimeMs + realSeconds * rate * 1000
      if (next > MAX_SIM_MS) set({ simTimeMs: MAX_SIM_MS, paused: true })
      else if (next < MIN_SIM_MS) set({ simTimeMs: MIN_SIM_MS, paused: true })
      else set({ simTimeMs: next })
    },
    togglePlay: () => set((s) => ({ paused: !s.paused })),
    faster: () => set((s) => ({ rate: stepRate(s.rate, 1) })),
    slower: () => set((s) => ({ rate: stepRate(s.rate, -1) })),
    reverse: () => set((s) => ({ rate: -s.rate })),
    goLive: () => set({ simTimeMs: nowMs(), rate: 1, paused: false }),
    resyncIfLive: (wasLive) => {
      if (wasLive) set({ simTimeMs: nowMs() })
    },
    jumpToDate: (isoDate) => {
      const ms = parseJumpDate(isoDate)
      if (ms === null) return false
      set({ simTimeMs: ms })
      return true
    },
    setSimTimeMs: (ms) => set({ simTimeMs: Math.min(MAX_SIM_MS, Math.max(MIN_SIM_MS, ms)) }),
    select: (id) =>
      set((s) => (id === null ? { selectedId: null } : { selectedId: id, followId: id, followSeq: s.followSeq + 1 })),
    stopFollow: () => set({ followId: null }),
    setLayer: (layer, on) => set((s) => ({ layers: { ...s.layers, [layer]: on } })),
    setShowers: (showers) => set({ showers }),
    showNasaPanel: (content) => set({ nasaPanel: content }),
    closeNasaPanel: () => set({ nasaPanel: null }),
    setDateModalOpen: (open) => set({ dateModalOpen: open }),
    setLoading: (patch) => set((s) => ({ loading: { ...s.loading, ...patch } })),
    setRate: (rate) => {
      if (RATE_STEPS.includes(Math.abs(rate))) set({ rate })
    },
    zoomBy: (factor) => set((s) => ({ zoom: { seq: s.zoom.seq + 1, factor } })),
    toggleInfo: () => set((s) => ({ infoCollapsed: !s.infoCollapsed })),
    resetView: () => set((s) => ({ followId: null, resetViewSeq: s.resetViewSeq + 1 })),
  }))
}
