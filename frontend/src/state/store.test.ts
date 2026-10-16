import { beforeEach, expect, test } from 'vitest'
import { createAppStore, SIM_START_MS, type AppStore } from './store'

let s: AppStore

beforeEach(() => {
  s = createAppStore()
})

test('advance adds speed × 24 sim hours per real second', () => {
  s.getState().setSpeed(2)
  s.getState().advance(0.5)
  expect(s.getState().simTimeMs).toBe(SIM_START_MS + 24 * 3600_000)
})

test('togglePlay pauses then restores last non-zero speed', () => {
  s.getState().setSpeed(-1.5)
  s.getState().togglePlay()
  expect(s.getState().speed).toBe(0)
  s.getState().togglePlay()
  expect(s.getState().speed).toBe(-1.5)
})

test('setSpeed clamps to [-3, 3]', () => {
  s.getState().setSpeed(9)
  expect(s.getState().speed).toBe(3)
  s.getState().setSpeed(-9)
  expect(s.getState().speed).toBe(-3)
})

test.each(['', 'abc', '2026-13-01', '2026-02-30', '99999-01-01', '1899-12-31', '2051-01-01'])(
  'jumpToDate rejects %s',
  (value) => {
    const before = s.getState().simTimeMs
    expect(s.getState().jumpToDate(value)).toBe(false)
    expect(s.getState().simTimeMs).toBe(before)
    expect(Number.isNaN(s.getState().simTimeMs)).toBe(false)
    expect(s.getState().simJumpSeq).toBe(0)
  }
)

test('jumpToDate accepts a valid date and bumps simJumpSeq', () => {
  expect(s.getState().jumpToDate('2030-01-02')).toBe(true)
  expect(s.getState().simTimeMs).toBe(Date.UTC(2030, 0, 2))
  expect(s.getState().simJumpSeq).toBe(1)
})

test('select sets selection and follow; select(null) keeps follow', () => {
  s.getState().select('mars')
  expect(s.getState().selectedId).toBe('mars')
  expect(s.getState().followId).toBe('mars')
  s.getState().select(null)
  expect(s.getState().selectedId).toBeNull()
  expect(s.getState().followId).toBe('mars')
})

test('resetView clears follow and bumps resetViewSeq', () => {
  s.getState().select('mars')
  s.getState().resetView()
  expect(s.getState().followId).toBeNull()
  expect(s.getState().resetViewSeq).toBe(1)
})

test('setLayer toggles one layer only', () => {
  s.getState().setLayer('orbits', false)
  expect(s.getState().layers).toEqual({ orbits: false, labels: true, liveEarthTexture: false })
})
