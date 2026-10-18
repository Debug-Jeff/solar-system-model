import { expect, test } from 'vitest'
import manifest from '../../public/models/manifest.json'
import { SATELLITES } from '../satellites/catalogue'
import { SPACECRAFT } from '../spacecraft/catalogue'

const files = import.meta.glob('../../public/models/*.glb', { query: '?url', import: 'default', eager: true })
const existing = new Set(Object.keys(files).map((k) => k.replace('../../public/', '')))

test('every model belongs to a catalogued craft, exists, and is credited', () => {
  const ids = new Set([...SPACECRAFT.map((c) => c.id), ...SATELLITES.map((s) => s.id)])
  const entries = Object.entries(manifest.models)
  expect(entries.length).toBeGreaterThanOrEqual(20)
  for (const [id, entry] of entries) {
    expect(ids.has(id), id).toBe(true)
    expect(existing.has(entry.file), entry.file).toBe(true)
    expect(entry.credit).toMatch(/NASA 3D Resources/)
  }
})
