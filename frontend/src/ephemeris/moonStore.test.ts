import { beforeEach, expect, test, vi } from 'vitest'
import earthSet from './fixtures/moons-frozen/moons-earth.json'
import { availability } from './index'
import { moonAvailability, moonOrbitPath, moonPosition, moonSetFor, onSetRegistered, registerSet, resetMoonStore } from './moonStore'
import { parseEphemSet } from './sampled'

const set = parseEphemSet(earthSet, 'moons-earth')
const track = set.bodies.moon!
const inside = track.startMs + 10.5 * track.stepMs
const outside = track.startMs - 86_400_000

beforeEach(() => resetMoonStore())

test('unknown moons have no position and are approximate', () => {
  expect(moonPosition('foo', inside)).toBeNull()
  expect(moonAvailability('foo', inside)).toBe('approximate')
})

test('a registered moon is exact inside its window and approximate outside', () => {
  registerSet(set)
  expect(moonPosition('moon', inside)).not.toBeNull()
  expect(moonAvailability('moon', inside)).toBe('exact')
  expect(moonPosition('moon', outside)).toBeNull()
  expect(moonAvailability('moon', outside)).toBe('approximate')
})

test('availability() consults the moon registry', () => {
  expect(availability('moon', inside)).toBe('approximate')
  registerSet(set)
  expect(availability('moon', inside)).toBe('exact')
})

test('re-registering a set replaces its data', () => {
  registerSet(set)
  const shifted = { ...set, bodies: { moon: { ...track, startMs: track.startMs + 1e12 } } }
  registerSet(shifted)
  expect(moonPosition('moon', inside)).toBeNull()
})

test('orbit path covers one period with 181 points inside the window and is partial at the edge', () => {
  registerSet(set)
  const mid = track.startMs + (track.count - 1) * track.stepMs * 0.5
  expect(moonOrbitPath('moon', mid, 27.32)).toHaveLength(181)
  const edge = moonOrbitPath('moon', track.startMs + 2 * 86_400_000, 27.32)
  expect(edge.length).toBeGreaterThan(0)
  expect(edge.length).toBeLessThan(181)
  expect(moonOrbitPath('moon', outside - 100 * 86_400_000, 27.32)).toEqual([])
})

test('listeners hear about registrations and can unsubscribe', () => {
  const listener = vi.fn()
  const off = onSetRegistered(listener)
  registerSet(set)
  expect(listener).toHaveBeenCalledWith('moons-earth')
  off()
  registerSet(set)
  expect(listener).toHaveBeenCalledTimes(1)
})

test('moonSetFor maps planets to their sets', () => {
  expect(moonSetFor('jupiter')).toBe('moons-jupiter')
  expect(moonSetFor('pluto')).toBe('moons-pluto')
  expect(moonSetFor('mercury')).toBeNull()
})

test('an older set never replaces a newer one (backend answers before the static file)', () => {
  const newer = { ...set, generatedAtMs: set.generatedAtMs + 86_400_000 }
  const older = { ...set, generatedAtMs: set.generatedAtMs, bodies: { moon: { ...track, startMs: track.startMs + 1e12 } } }
  registerSet(newer)
  registerSet(older)
  expect(moonPosition('moon', inside)).not.toBeNull()
})
