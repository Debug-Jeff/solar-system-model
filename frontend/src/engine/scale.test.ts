import { expect, test } from 'vitest'
import { moonVisualDistance, orbitVisualDistance, planetVisualRadius, sunVisualRadius } from './scale'

test('earth visual radius is 1.6', () => expect(planetVisualRadius(6371)).toBeCloseTo(1.6, 9))

test('sun visual radius is 10', () => expect(sunVisualRadius()).toBe(10))

test('orbitVisualDistance(1 AU) = 18 + 16', () => expect(orbitVisualDistance(1)).toBeCloseTo(34, 9))

test('moonVisualDistance at lunar distance', () =>
  expect(moonVisualDistance(384_400, 1.6)).toBeCloseTo(1.6 * 2.6 + 3.4, 9))
