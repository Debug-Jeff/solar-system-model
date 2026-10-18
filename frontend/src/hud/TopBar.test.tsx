import { act, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { createAppStore } from '../state/store'
import type { Body } from '../types/body'
import { TopBar } from './TopBar'

const jupiter = { id: 'jupiter', name: 'Jupiter', type: 'planet', radiusKm: 1, orbitalPeriodDays: 1, rotationPeriodHours: 1, axialTiltDeg: 0, meanTempC: 0, moonCount: 0, facts: [] } as Body

test('the breadcrumb names the body being followed and clears when following stops', () => {
  const store = createAppStore()
  store.getState().setBodies([jupiter])
  render(<TopBar store={store} />)
  act(() => store.getState().select('jupiter'))
  expect(screen.getByText(/Jupiter/)).toBeInTheDocument()
  act(() => store.getState().stopFollow())
  expect(screen.queryByText(/Jupiter/)).toBeNull()
})

test('there is no menu or NASA image buttons any more', () => {
  render(<TopBar store={createAppStore()} />)
  expect(screen.queryByRole('button', { name: /Menu/ })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Picture of the Day' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
})
