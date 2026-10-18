import smallBodies from '../../public/data/smallbodies.json'
import { expect, test } from 'vitest'
import manifest from '../../public/models/manifest.json'
import { SATELLITES } from '../satellites/catalogue'
import { SPACECRAFT } from '../spacecraft/catalogue'

const files = import.meta.glob('../../public/models/*.glb', { query: '?url', import: 'default', eager: true })
const existing = new Set(Object.keys(files).map((k) => k.replace('../../public/', '')))

const smallBodyIds = new Set(smallBodies.named.filter((b) => b.type === 'asteroid' || b.type === 'comet').map((b) => b.id))

test('every model belongs to a catalogued craft or small body, exists, and is credited', () => {
  const craftIds = new Set([...SPACECRAFT.map((c) => c.id), ...SATELLITES.map((s) => s.id)])
  const entries = Object.entries(manifest.models)
  expect(entries.length).toBeGreaterThanOrEqual(25)
  for (const [id, entry] of entries as [string, { file: string; credit: string; sizeKm?: number }][]) {
    expect(existing.has(entry.file), entry.file).toBe(true)
    if (craftIds.has(id)) {
      expect(entry.credit).toMatch(/NASA 3D Resources/)
    } else {
      expect(smallBodyIds.has(id), id).toBe(true)
      expect(entry.credit).toMatch(/NASA Visualization Technology/)
      expect(entry.sizeKm).toBeGreaterThan(0)
    }
  }
})
