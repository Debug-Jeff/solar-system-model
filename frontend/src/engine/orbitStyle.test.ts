import * as THREE from 'three'
import { expect, test } from 'vitest'
import type { Body } from '../types/body'
import { AU_KM } from './frames'
import { COMET_ORBIT_COLOR, ORBIT_OPACITY, orbitColor, relativePositions } from './orbitStyle'

const base = { radiusKm: 1, orbitalPeriodDays: 1, rotationPeriodHours: 1, axialTiltDeg: 0, meanTempC: 0, moonCount: 0, facts: [] }
const earth: Body = { ...base, id: 'earth', name: 'Earth', type: 'planet', color: '#2f6fbf' }
const mars: Body = { ...base, id: 'mars', name: 'Mars', type: 'planet', color: '#c1440e' }
const ceres: Body = { ...base, id: 'ceres', name: 'Ceres', type: 'dwarfPlanet', color: '#8a8a8a' }
const halley: Body = { ...base, id: 'halley', name: 'Halley', type: 'comet', color: '#3a3a3a' }
const moon: Body = { ...base, id: 'moon', name: 'Moon', type: 'moon', color: '#cccccc', parent: 'earth' }

test('planets use their own colour at normal opacity', () => {
  expect(orbitColor(mars, null)).toEqual({ color: '#c1440e', opacity: ORBIT_OPACITY.normal })
})

test('dwarf planets are a lighter version of their colour', () => {
  const { color } = orbitColor(ceres, null)
  expect(new THREE.Color(color).getHSL({ h: 0, s: 0, l: 0 }).l).toBeCloseTo(0.7, 2)
})

test('comets are icy cyan', () => {
  expect(orbitColor(halley, null).color).toBe(COMET_ORBIT_COLOR)
  expect(COMET_ORBIT_COLOR).toBe('#7fe0ff')
})

test('moons use the parent colour at half opacity', () => {
  expect(orbitColor(moon, earth)).toEqual({ color: '#2f6fbf', opacity: 0.5 })
})

test('relativePositions keeps 1 km precision 30 AU out', () => {
  const origin = new THREE.Vector3(30 * AU_KM, 0, 0)
  const out = relativePositions([new THREE.Vector3(30 * AU_KM + 1, 0, 0)], origin)
  expect(out[0]).toBe(1)
  expect(Float32Array.of(30 * AU_KM + 1)[0]! - 30 * AU_KM).not.toBe(1)
})
