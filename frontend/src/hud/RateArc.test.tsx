import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { createAppStore } from '../state/store'
import { RateArc } from './RateArc'

test('the rate dial steps through speeds and directions with the keyboard', () => {
  const store = createAppStore(() => Date.UTC(2026, 9, 18))
  render(<RateArc store={store} />)
  const dial = screen.getByRole('slider', { name: 'Time rate' })
  expect(dial.getAttribute('aria-valuetext')).toBe('real rate')
  fireEvent.keyDown(dial, { key: 'ArrowRight' })
  expect(store.getState().rate).toBe(60)
  fireEvent.keyDown(dial, { key: 'ArrowLeft' })
  fireEvent.keyDown(dial, { key: 'ArrowLeft' })
  expect(store.getState().rate).toBe(-1)
  fireEvent.keyDown(dial, { key: 'End' })
  expect(store.getState().rate).toBe(31_557_600)
  fireEvent.keyDown(dial, { key: 'Home' })
  expect(store.getState().rate).toBe(-31_557_600)
})
