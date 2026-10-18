import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { createAppStore } from '../state/store'
import { RightRail } from './RightRail'

test('the rail zooms, resets the view and toggles the info panel', () => {
  const store = createAppStore()
  render(<RightRail store={store} />)
  fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
  expect(store.getState().zoom.factor).toBeLessThan(1)
  fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
  expect(store.getState().zoom.factor).toBeGreaterThan(1)
  const reset = store.getState().resetViewSeq
  fireEvent.click(screen.getByRole('button', { name: 'Reset view' }))
  expect(store.getState().resetViewSeq).toBe(reset + 1)
  fireEvent.click(screen.getByRole('button', { name: 'Info' }))
  expect(store.getState().infoCollapsed).toBe(true)
  expect(screen.getByRole('button', { name: 'Layers' })).toBeInTheDocument()
})
