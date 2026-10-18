import * as THREE from 'three'
import { afterEach, expect, test, vi } from 'vitest'
import { createTextures, resolveTexture, type TextureManifest } from './textures'

afterEach(() => vi.restoreAllMocks())

const manifest: TextureManifest = {
  version: 1,
  textures: {
    jupiter: { low: 'textures/jupiter/color-1024.webp', medium: 'textures/jupiter/color-2048.webp', high: 'textures/jupiter/color-2048.webp', credit: 'x' },
  },
}

test('paths resolve by tier and fall back to the next tier down', () => {
  expect(resolveTexture(manifest, 'jupiter', 'medium')).toBe('/textures/jupiter/color-2048.webp')
  const partial = { version: 1, textures: { jupiter: { low: 'textures/jupiter/color-1024.webp', credit: 'x' } } } as unknown as TextureManifest
  expect(resolveTexture(partial, 'jupiter', 'high')).toBe('/textures/jupiter/color-1024.webp')
  expect(resolveTexture(partial, 'nope', 'high')).toBeNull()
})

test('the medium tier only requests medium files', () => {
  const urls: string[] = []
  vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(function (url: string) {
    urls.push(url)
    return new THREE.Texture()
  })
  createTextures('medium', { onProgress: () => {}, onDone: () => {} })
  expect(urls.length).toBeGreaterThan(10)
  expect(urls.every((u) => !/-4096\.webp$/.test(u))).toBe(true)
  expect(urls.some((u) => /-2048\.webp$/.test(u))).toBe(true)
})

import { loadProgressive } from './textures'

test('a progressive texture loads the low tier first, then the requested tier', () => {
  const urls: string[] = []
  vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(((url: string, onLoad?: (t: THREE.Texture) => void) => {
    urls.push(url)
    const t = new THREE.Texture()
    onLoad?.(t)
    return t
  }) as never)
  const seen: THREE.Texture[] = []
  loadProgressive('jupiter', 'high', (t) => seen.push(t), manifest)
  expect(urls).toEqual(['/textures/jupiter/color-1024.webp', '/textures/jupiter/color-2048.webp'])
  expect(seen).toHaveLength(2)
})
