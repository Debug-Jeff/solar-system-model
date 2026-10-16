import { render } from '@testing-library/react'
import { expect, test } from 'vitest'
import { createAppStore } from '../state/store'
import { App } from './App'

test('date modal is not nested inside the footer', () => {
  const store = createAppStore()
  store.getState().setDateModalOpen(true)
  render(<App store={store} />)
  const modal = document.getElementById('date-modal')
  expect(modal).not.toBeNull()
  expect(modal!.closest('#hud-bottom')).toBeNull()
})
