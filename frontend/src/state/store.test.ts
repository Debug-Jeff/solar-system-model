import { beforeEach, expect, test } from 'vitest'
import { createAppStore, isLive, MAX_SIM_MS, MIN_SIM_MS, RATE_STEPS, type AppStore } from './store'

let now: number
let s: AppStore

beforeEach(() => {
  now = Date.UTC(2026, 9, 16, 12)
  s = createAppStore(() => now)
})

const st = () => s.getState()

test('starts at now, real rate, live', () => {
  expect(st().simTimeMs).toBe(now)
  expect(st().rate).toBe(1)
  expect(st().paused).toBe(false)
  expect(isLive(st(), now)).toBe(true)
})

test('advance adds realSeconds × rate', () => {
  s.setState({ rate: 3600 })
  st().advance(2)
  expect(st().simTimeMs).toBe(now + 2 * 3600 * 1000)
})

test('faster steps through RATE_STEPS and stops at the top', () => {
  st().faster()
  expect(st().rate).toBe(60)
  s.setState({ rate: RATE_STEPS[RATE_STEPS.length - 1]! })
  st().faster()
  expect(st().rate).toBe(31_557_600)
})

test('slower stops at real rate', () => {
  st().slower()
  expect(st().rate).toBe(1)
  s.setState({ rate: 86_400 })
  st().slower()
  expect(st().rate).toBe(3600)
})

test('reverse keeps the magnitude and faster keeps the sign', () => {
  st().reverse()
  expect(st().rate).toBe(-1)
  st().faster()
  expect(st().rate).toBe(-60)
})

test('paused: advance changes nothing and not live', () => {
  st().togglePlay()
  expect(st().paused).toBe(true)
  st().advance(5)
  expect(st().simTimeMs).toBe(now)
  expect(isLive(st(), now)).toBe(false)
  st().togglePlay()
  expect(st().paused).toBe(false)
})

test('running past the end clamps and pauses', () => {
  s.setState({ simTimeMs: Date.UTC(2050, 11, 1), rate: 31_557_600 })
  st().advance(10)
  expect(st().simTimeMs).toBe(MAX_SIM_MS)
  expect(st().paused).toBe(true)
  expect(Number.isNaN(st().simTimeMs)).toBe(false)
})

test('running before the start in reverse clamps and pauses', () => {
  s.setState({ simTimeMs: Date.UTC(1900, 1, 1), rate: -31_557_600 })
  st().advance(10)
  expect(st().simTimeMs).toBe(MIN_SIM_MS)
  expect(st().paused).toBe(true)
})

test('goLive restores now, real rate and unpaused', () => {
  st().jumpToDate('2030-01-02')
  st().faster()
  st().togglePlay()
  now += 5000
  st().goLive()
  expect(st().simTimeMs).toBe(now)
  expect(st().rate).toBe(1)
  expect(st().paused).toBe(false)
  expect(isLive(st(), now)).toBe(true)
})

test('isLive tolerates under 2 s of drift only', () => {
  expect(isLive({ ...st(), simTimeMs: now - 1000 }, now)).toBe(true)
  expect(isLive({ ...st(), simTimeMs: now - 3000 }, now)).toBe(false)
  expect(isLive({ ...st(), rate: 60 }, now)).toBe(false)
})

test('resyncIfLive jumps to now only when it was live', () => {
  now += 600_000
  st().resyncIfLive(false)
  expect(st().simTimeMs).toBe(Date.UTC(2026, 9, 16, 12))
  st().resyncIfLive(true)
  expect(st().simTimeMs).toBe(now)
})

test.each(['', 'abc', '2026-13-01', '2026-02-30', '99999-01-01', '1899-12-31', '2051-01-01'])(
  'jumpToDate rejects %s',
  (value) => {
    expect(st().jumpToDate(value)).toBe(false)
    expect(st().simTimeMs).toBe(now)
  }
)

test('jumpToDate sets time and keeps rate', () => {
  st().faster()
  expect(st().jumpToDate('2030-01-02')).toBe(true)
  expect(st().simTimeMs).toBe(Date.UTC(2030, 0, 2))
  expect(st().rate).toBe(60)
})

test('select sets selection and follow; select(null) keeps follow', () => {
  st().select('mars')
  expect(st().selectedId).toBe('mars')
  expect(st().followId).toBe('mars')
  st().select(null)
  expect(st().selectedId).toBeNull()
  expect(st().followId).toBe('mars')
})

test('selecting the followed body again bumps followSeq so the camera re-frames', () => {
  st().select('mars')
  st().select('mars')
  expect(st().followSeq).toBe(2)
  st().select(null)
  expect(st().followSeq).toBe(2)
})

test('resetView clears follow and bumps resetViewSeq', () => {
  st().select('mars')
  st().resetView()
  expect(st().followId).toBeNull()
  expect(st().resetViewSeq).toBe(1)
})

test('setLayer toggles one layer only', () => {
  st().setLayer('orbits', false)
  expect(st().layers).toEqual({ orbits: false, labels: true, constellations: false, meteorShowers: true })
})

test('setSimTimeMs jumps to a moment and clamps to the supported range', () => {
  const store = createAppStore(() => Date.UTC(2026, 9, 18))
  store.getState().setSimTimeMs(Date.UTC(2030, 0, 1, 6))
  expect(store.getState().simTimeMs).toBe(Date.UTC(2030, 0, 1, 6))
  store.getState().setSimTimeMs(Date.UTC(1700, 0, 1))
  expect(store.getState().simTimeMs).toBe(MIN_SIM_MS)
})

test('setRate, zoomBy and toggleInfo drive the new HUD controls', () => {
  const store = createAppStore(() => Date.UTC(2026, 9, 18))
  store.getState().setRate(-3600)
  expect(store.getState().rate).toBe(-3600)
  store.getState().setRate(7)
  expect(store.getState().rate).toBe(-3600)
  const seq = store.getState().zoom.seq
  store.getState().zoomBy(0.5)
  expect(store.getState().zoom).toEqual({ seq: seq + 1, factor: 0.5 })
  expect(store.getState().infoCollapsed).toBe(false)
  store.getState().toggleInfo()
  expect(store.getState().infoCollapsed).toBe(true)
})
