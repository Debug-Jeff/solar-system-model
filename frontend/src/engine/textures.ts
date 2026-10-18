import * as THREE from 'three'
import bundledManifest from '../../public/textures/manifest.json'
import type { QualityTier } from './quality'

export interface TextureManifest {
  version: number
  textures: Record<string, Partial<Record<QualityTier, string>> & { credit: string }>
}

export interface Textures {
  sun: THREE.Texture
  mercury: THREE.Texture
  venus: { clouds: THREE.Texture }
  earth: {
    day: THREE.Texture
    night: THREE.Texture
    clouds: THREE.Texture
    specular: THREE.Texture
  }
  moon: { map: THREE.Texture; bump: THREE.Texture }
  mars: THREE.Texture
  jupiter: THREE.Texture
  saturn: { map: THREE.Texture; ring: THREE.Texture }
  uranus: { map: THREE.Texture; ring: THREE.Texture }
  neptune: THREE.Texture
}

export interface TextureLoadingCallbacks {
  onProgress(loaded: number, total: number): void
  onDone(): void
}

const FALLBACK_ORDER: Record<QualityTier, QualityTier[]> = {
  high: ['high', 'medium', 'low'],
  medium: ['medium', 'low'],
  low: ['low'],
}

export function resolveTexture(manifest: TextureManifest, key: string, tier: QualityTier): string | null {
  const entry = manifest.textures[key]
  if (!entry) return null
  for (const t of FALLBACK_ORDER[tier]) {
    const path = entry[t]
    if (path) return `/${path}`
  }
  return null
}

export function createTextures(tier: QualityTier, { onProgress, onDone }: TextureLoadingCallbacks, manifest: TextureManifest = bundledManifest): Textures {
  const manager = new THREE.LoadingManager()
  manager.onProgress = (_url, loaded, total) => onProgress(loaded, total)
  manager.onLoad = onDone
  manager.onError = (url) => console.warn(`Texture failed to load: ${url}`)
  const loader = new THREE.TextureLoader(manager)

  const load = (key: string, colorSpace: THREE.ColorSpace) => {
    const path = resolveTexture(manifest, key, tier)
    const tex = path ? loader.load(path) : new THREE.Texture()
    tex.colorSpace = colorSpace
    return tex
  }
  const color = (key: string) => load(key, THREE.SRGBColorSpace)
  const data = (key: string) => load(key, THREE.NoColorSpace)

  return {
    sun: color('sun'),
    mercury: color('mercury'),
    venus: { clouds: color('venus') },
    earth: { day: color('earthDay'), night: color('earthNight'), clouds: data('earthClouds'), specular: data('earthSpecular') },
    moon: { map: color('moon'), bump: data('moonBump') },
    mars: color('mars'),
    jupiter: color('jupiter'),
    saturn: { map: color('saturn'), ring: color('saturnRing') },
    uranus: { map: color('uranus'), ring: color('uranusRing') },
    neptune: color('neptune'),
  }
}

export function loadLiveEarthTexture(apiBase: string): Promise<THREE.Texture> {
  return new THREE.TextureLoader().loadAsync(apiBase + '/api/gibs/earth-texture').then((tex) => {
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  })
}
