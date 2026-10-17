import { expect, test } from 'vitest'
import { parseEphemSet, sampledPosition, type SampledTrack } from './sampled'
import { UNIX_EPOCH_JD } from './types'

const R = 1000
const PERIOD_S = 86_400
const W = (2 * Math.PI) / PERIOD_S
const STEP_MIN = 120
const START_JD = 2461299.5
const startMs = (START_JD - UNIX_EPOCH_JD) * 86_400_000

function circleStates(count: number): number[] {
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    const t = i * STEP_MIN * 60
    out.push(R * Math.cos(W * t), R * Math.sin(W * t), 0, -R * W * Math.sin(W * t), R * W * Math.cos(W * t), 0)
  }
  return out
}

function rawSet(patch: Record<string, unknown> = {}, bodyPatch: Record<string, unknown> = {}) {
  return {
    version: 1,
    set: 'moons-test',
    generatedAt: '2026-10-16T00:00:00Z',
    startJd: START_JD,
    bodies: { probe: { center: 'earth', stepMinutes: STEP_MIN, count: 25, states: circleStates(25), ...bodyPatch } },
    ...patch,
  }
}

function track(): SampledTrack {
  return parseEphemSet(rawSet(), 'moons-test').bodies.probe!
}

test('Hermite interpolation at mid-step is within 0.5 km of the true circle', () => {
  const t = 5.5 * STEP_MIN * 60
  const p = sampledPosition(track(), startMs + t * 1000)!
  expect(Math.hypot(p.x - R * Math.cos(W * t), p.y - R * Math.sin(W * t), p.z)).toBeLessThan(0.5)
})

test('at a node the sample is exact', () => {
  const t = 7 * STEP_MIN * 60
  const p = sampledPosition(track(), startMs + t * 1000)!
  expect(p.x).toBeCloseTo(R * Math.cos(W * t), 9)
  expect(p.y).toBeCloseTo(R * Math.sin(W * t), 9)
})

test('outside the window there is no position', () => {
  const tr = track()
  expect(sampledPosition(tr, startMs - 1)).toBeNull()
  expect(sampledPosition(tr, startMs + 24 * STEP_MIN * 60_000 + 1)).toBeNull()
  expect(sampledPosition(tr, startMs + 24 * STEP_MIN * 60_000)).not.toBeNull()
})

test('parseEphemSet exposes generatedAt and the track timing', () => {
  const set = parseEphemSet(rawSet(), 'moons-test')
  expect(set.generatedAtMs).toBe(Date.UTC(2026, 9, 16))
  expect(set.bodies.probe!.startMs).toBe(startMs)
  expect(set.bodies.probe!.stepMs).toBe(STEP_MIN * 60_000)
  expect(set.bodies.probe!.center).toBe('earth')
})

test.each([
  ['wrong version', rawSet({ version: 2 })],
  ['wrong set', rawSet({ set: 'moons-mars' })],
  ['count mismatch', rawSet({}, { count: 24 })],
  ['NaN', rawSet({}, { states: [...circleStates(24), Number.NaN, 0, 0, 0, 0, 0] })],
  ['negative step', rawSet({}, { stepMinutes: -5 })],
  ['too many samples', rawSet({}, { count: 6000, states: new Array(36000).fill(0) })],
  ['bad generatedAt', rawSet({ generatedAt: 'yesterday' })],
  ['not an object', 'nope'],
])('parseEphemSet rejects %s', (_name, raw) => {
  expect(() => parseEphemSet(raw, 'moons-test')).toThrow()
})

test('a per-body startJd overrides the set start', () => {
  const set = parseEphemSet(rawSet({}, { startJd: START_JD + 2 }), 'moons-test')
  expect(set.bodies.probe!.startMs).toBe(startMs + 2 * 86_400_000)
  expect(() => parseEphemSet(rawSet({}, { startJd: 'soon' }), 'moons-test')).toThrow()
})
