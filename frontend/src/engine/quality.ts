export type QualityTier = 'low' | 'medium' | 'high'

export interface QualityEnv {
  search: string
  coarsePointer: boolean
  screenMin: number
  deviceMemory?: number
  hardwareConcurrency?: number
}

export const QUALITY: Record<QualityTier, { pixelRatioCap: number; antialias: boolean; texture: QualityTier }> = {
  low: { pixelRatioCap: 1, antialias: false, texture: 'low' },
  medium: { pixelRatioCap: 1.5, antialias: true, texture: 'medium' },
  high: { pixelRatioCap: 2, antialias: true, texture: 'high' },
}

const isTier = (v: string | null): v is QualityTier => v === 'low' || v === 'medium' || v === 'high'

export function detectQuality(env: QualityEnv): QualityTier {
  const override = new URLSearchParams(env.search).get('quality')
  if (isTier(override)) return override
  const memory = env.deviceMemory ?? 8
  const cores = env.hardwareConcurrency ?? 4
  if (env.coarsePointer && env.screenMin < 900) return memory <= 3 || cores <= 4 ? 'low' : 'medium'
  return memory >= 8 && cores >= 8 ? 'high' : 'medium'
}

export function browserQualityEnv(): QualityEnv {
  const nav = navigator as Navigator & { deviceMemory?: number }
  return {
    search: window.location.search,
    coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
    screenMin: Math.min(window.screen.width, window.screen.height),
    deviceMemory: nav.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
  }
}
