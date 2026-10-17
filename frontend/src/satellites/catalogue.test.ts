import { expect, test } from 'vitest'
import planets from '../../../backend/data/planets.json'
import smallBodies from '../../public/data/smallbodies.json'
import satellites from '../../public/data/satellites.json'
import { SPACECRAFT } from '../spacecraft/catalogue'
import { orbitColor } from '../engine/orbitStyle'
import { formatType } from '../hud/format'
import { SATELLITES, satelliteRecords } from './catalogue'

test('catalogue ids are unique and every satellite in the data is catalogued', () => {
  const ids = SATELLITES.map((s) => s.id)
  expect(new Set(ids).size).toBe(ids.length)
  for (const s of satellites.satellites) expect(ids, s.id).toContain(s.id)
})

test('satellite ids never collide with any other body', () => {
  const taken = new Set<string>([
    ...planets.bodies.map((b: { id: string }) => b.id),
    ...smallBodies.named.map((b: { id: string }) => b.id),
    ...smallBodies.neos.map((b: { id: string }) => b.id),
    ...SPACECRAFT.map((c) => c.id),
  ])
  for (const s of SATELLITES) expect(taken.has(s.id), s.id).toBe(false)
})

test('records are Earth satellites with the fourth orbit hue', () => {
  const records = satelliteRecords()
  expect(records).toHaveLength(SATELLITES.length)
  for (const r of records) {
    expect(r.type).toBe('satellite')
    expect(r.parent).toBe('earth')
    expect(r.radiusKm).toBeGreaterThan(0)
    expect(r.mission?.description).toBeTruthy()
    expect(orbitColor(r, null).color).toBe('#f472b6')
  }
  expect(formatType('satellite')).toBe('Earth satellite')
})
