import { expect, test } from 'vitest'
import manifest from '../../public/textures/manifest.json'

const files = import.meta.glob('../../public/textures/**/*.{webp,png}', { query: '?url', import: 'default', eager: true })
const existing = new Set(Object.keys(files).map((k) => k.replace('../../public/', '')))
const oldJpegs = import.meta.glob('../../public/textures/**/*.jpg', { query: '?url', import: 'default', eager: true })

const REQUIRED = ['sun', 'mercury', 'venus', 'earthDay', 'earthNight', 'earthClouds', 'earthSpecular', 'moon', 'moonBump', 'mars', 'jupiter', 'saturn', 'saturnRing', 'uranus', 'uranusRing', 'neptune']

test('every texture the engine needs has a file per tier and a credit', () => {
  const textures = manifest.textures as Record<string, { low: string; medium: string; high: string; credit: string }>
  for (const key of REQUIRED) {
    const entry = textures[key]
    expect(entry, key).toBeDefined()
    for (const tier of ['low', 'medium', 'high'] as const) expect(existing.has(entry![tier]), `${key} ${tier}`).toBe(true)
    expect(entry!.credit.length, key).toBeGreaterThan(10)
  }
})

test('none of the old unsourced textures remain', () => {
  expect(Object.keys(oldJpegs)).toEqual([])
})
