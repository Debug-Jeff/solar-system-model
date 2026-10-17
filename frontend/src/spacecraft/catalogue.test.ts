import { expect, test } from 'vitest'
import { EPHEM_SETS } from '../ephemeris/loader'
import spacecraftSet from '../../public/data/ephem/spacecraft.json'
import { SPACECRAFT, spacecraftRecords } from './catalogue'

const trackedIds = () => Object.keys(spacecraftSet.bodies)

test('spacecraft is an allowed set', () => {
  expect(EPHEM_SETS).toContain('spacecraft')
})

test('every catalogued craft has a track in the generated data, and vice versa', () => {
  const tracked = new Set([...trackedIds(), 'jwst', 'mro', 'juno'])
  for (const craft of SPACECRAFT) expect(tracked.has(craft.id), craft.id).toBe(true)
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
