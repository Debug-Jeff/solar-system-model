import * as THREE from 'three'
import { expect, test } from 'vitest'
import type { BodyType } from '../types/body'
import { createTrail, isTrailType, trailSamples } from './trails'

test('only satellites, spacecraft, asteroids and comets get trails', () => {
  expect((['satellite', 'spacecraft', 'asteroid', 'comet'] as BodyType[]).every(isTrailType)).toBe(true)
  expect((['planet', 'dwarfPlanet', 'moon', 'star'] as BodyType[]).some(isTrailType)).toBe(false)
})

test('trail samples run backwards from now, relative to the body, and stop where data ends', () => {
  const at = (t: number) => (t >= -50 ? new THREE.Vector3(t, 0, 0) : null)
  const pts = trailSamples(at, 0, 100, 10)
  expect(pts[0]!.toArray()).toEqual([0, 0, 0])
  expect(pts[1]!.x).toBeCloseTo(-100 / 9, 9)
  expect(pts).toHaveLength(5)
  expect(trailSamples(() => null, 0, 100, 10)).toEqual([])
})

test('a trail fades from bright at the body to dark at the tail', () => {
  const trail = createTrail()
  trail.setPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(2, 0, 0)])
  const colors = trail.colors()
  expect(colors[0]).toBeCloseTo(1, 6)
  expect(colors[colors.length - 1]).toBeLessThan(0.05)
  expect(trail.line.visible).toBe(true)
  trail.setPoints([new THREE.Vector3()])
  expect(trail.line.visible).toBe(false)
  trail.dispose()
})
