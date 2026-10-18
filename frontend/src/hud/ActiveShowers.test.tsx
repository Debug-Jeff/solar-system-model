import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import file from '../../public/data/meteor-showers.json'
import { parseShowersFile } from '../meteors/showers'
import { createAppStore } from '../state/store'
import { ActiveShowers } from './ActiveShowers'

const showers = parseShowersFile(file)

test('names the active shower with its peak date and rate', () => {
  const store = createAppStore(() => Date.parse('2026-10-18T12:00:00Z'))
  store.getState().setShowers(showers)
  render(<ActiveShowers store={store} />)
  expect(screen.getByText(/Orionids active · peak Oct 2[01] · up to 20\/hr/)).toBeInTheDocument()
})

test('shows nothing when no shower is active or the layer is off', () => {
  const store = createAppStore(() => Date.parse('2026-03-05T12:00:00Z'))
  store.getState().setShowers(showers)
  const { container } = render(<ActiveShowers store={store} />)
  expect(container.textContent).toBe('')
  const autumn = createAppStore(() => Date.parse('2026-10-18T12:00:00Z'))
  autumn.getState().setShowers(showers)
  autumn.getState().setLayer('meteorShowers', false)
  const second = render(<ActiveShowers store={autumn} />)
  expect(second.container.textContent).toBe('')
})
