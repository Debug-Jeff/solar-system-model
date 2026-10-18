import { expect, test } from 'vitest'
import type { Body } from '../types/body'
import { searchBodies } from './searchBodies'

const b = (id: string, name: string, type: Body['type']): Body => ({ id, name, type, radiusKm: 1, orbitalPeriodDays: 1, rotationPeriodHours: 1, axialTiltDeg: 0, meanTempC: 0, moonCount: 0, facts: [] })
const bodies = [
  b('mars', 'Mars', 'planet'),
  b('mro', 'Mars Reconnaissance Orbiter', 'spacecraft'),
  b('marsh', 'Marsh Comet', 'comet'),
  b('io', 'Io', 'moon'),
  b('ceres', 'Ceres', 'dwarfPlanet'),
  b('hubble', 'Hubble Space Telescope', 'satellite'),
  b('jwst', 'James Webb Space Telescope', 'spacecraft'),
  b('enceladus', 'Encéladus', 'moon'),
]
const ids = (q: string, limit?: number) => searchBodies(bodies, q, limit).map((x) => x.id)

test('exact matches win, then word starts, then substrings', () => {
  expect(ids('mars')).toEqual(['mars', 'mro', 'marsh'])
  expect(ids('telescope')).toEqual(['jwst', 'hubble'])
  expect(ids('ubb')).toEqual(['hubble'])
  expect(ids('IO')[0]).toBe('io')
})

test('search ignores case and accents, and respects the limit', () => {
  expect(ids('encel')).toEqual(['enceladus'])
  expect(ids('e', 2)).toHaveLength(2)
})

test('an empty query finds nothing', () => {
  expect(ids('')).toEqual([])
  expect(ids('   ')).toEqual([])
})
