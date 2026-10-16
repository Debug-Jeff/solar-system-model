import { expect, test } from 'vitest'
import { createTapDetector } from './tap'

const ev = (pointerId: number, x: number, y: number) => ({ pointerId, x, y })

test('a short press is a tap', () => {
  const t = createTapDetector()
  t.down(ev(1, 10, 10))
  expect(t.up(ev(1, 13, 14))).toBe(true)
})

test('moving more than 5 px is a drag', () => {
  const t = createTapDetector()
  t.down(ev(1, 10, 10))
  expect(t.up(ev(1, 16, 10))).toBe(false)
})

test('a pinch is never a tap, even when one finger lifts in place', () => {
  const t = createTapDetector()
  t.down(ev(1, 10, 10))
  t.down(ev(2, 200, 200))
  expect(t.up(ev(2, 200, 200))).toBe(false)
  expect(t.up(ev(1, 10, 10))).toBe(false)
})

test('a cancelled pointer is not a tap', () => {
  const t = createTapDetector()
  t.down(ev(1, 10, 10))
  t.cancel(1)
  expect(t.up(ev(1, 10, 10))).toBe(false)
})

test('a fresh gesture after a pinch can tap again', () => {
  const t = createTapDetector()
  t.down(ev(1, 0, 0))
  t.down(ev(2, 50, 50))
  t.up(ev(1, 0, 0))
  t.up(ev(2, 50, 50))
  t.down(ev(3, 5, 5))
  expect(t.up(ev(3, 5, 5))).toBe(true)
})
