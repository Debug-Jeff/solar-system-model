import { expect, test } from 'vitest'
import { EPHEM_SETS } from '../ephemeris/loader'
import spacecraftSet from '../../public/data/ephem/spacecraft.json'
import { SPACECRAFT, spacecraftRecords } from './catalogue'

const trackedIds = () => Object.keys(spacecraftSet.bodies)

test('spacecraft is an allowed set', () => {
  expect(EPHEM_SETS).toContain('spacecraft')
})

test('every craft in the generated data is catalogued (the Go test checks the registry)', () => {
  for (const id of trackedIds()) expect(SPACECRAFT.some((c) => c.id === id), id).toBe(true)
})

test('records are well-formed spacecraft bodies', () => {
  const records = spacecraftRecords()
  expect(records).toHaveLength(SPACECRAFT.length)
  for (const r of records) {
    expect(r.type).toBe('spacecraft')
    expect(['sun', 'earth', 'mars', 'jupiter']).toContain(r.parent)
    expect(r.radiusKm).toBeGreaterThan(0)
    expect(r.mission?.launched).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(r.facts.length).toBeGreaterThan(0)
  }
})

import planets from '../../../backend/data/planets.json'
import smallBodies from '../../public/data/smallbodies.json'

test('spacecraft ids never collide with planets, moons, small bodies or NEOs', () => {
  const taken = new Set<string>([
    ...planets.bodies.map((b: { id: string }) => b.id),
    ...smallBodies.named.map((b: { id: string }) => b.id),
    ...smallBodies.neos.map((b: { id: string }) => b.id),
  ])
  for (const craft of SPACECRAFT) expect(taken.has(craft.id), craft.id).toBe(false)
})
