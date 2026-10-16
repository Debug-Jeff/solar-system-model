import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { createAppStore } from '../state/store'
import type { Body } from '../types/body'
import { InfoPanel } from './InfoPanel'

const base = {
  radiusKm: 1,
  orbitalPeriodDays: 1,
  rotationPeriodHours: 1,
  axialTiltDeg: 0,
  meanTempC: 0,
  moonCount: 0,
  facts: [],
}
const bodies: Body[] = [
  { ...base, id: 'sun', name: 'Sun', type: 'star' },
  { ...base, id: 'mars', name: 'Mars', type: 'planet', distanceFromSunAU: 1.52 },
  { ...base, id: 'halley', name: "Halley's Comet", type: 'comet', distanceFromSunAU: 17.8 },
]

test.each([
  ['mars', 'Accurate'],
  ['halley', 'Approximate'],
  ['sun', 'Accurate'],
])('%s position reads %s', (id, label) => {
  const store = createAppStore(() => Date.UTC(2026, 9, 16))
  store.getState().setBodies(bodies)
  store.getState().select(id)
  render(<InfoPanel store={store} />)
  const row = screen.getByText('Position').parentElement!
  expect(row).toHaveTextContent(label)
})

test('a near-Earth object shows its close approach', () => {
  const store = createAppStore(() => Date.UTC(2026, 9, 16))
  store.getState().setBodies([
    { ...base, id: 'neo-1', name: '(2017 UX7)', type: 'asteroid', radiusKm: 0.01, rotationPeriodHours: 0, meanTempC: Number.NaN, neo: { approachMs: Date.UTC(2026, 9, 22, 17, 8), missKm: 6_500_634, speedKmS: 5.69, hazardous: false } },
  ])
  store.getState().select('neo-1')
  render(<InfoPanel store={store} />)
  expect(screen.getByText('Closest approach').parentElement).toHaveTextContent('Oct 22, 2026')
  expect(screen.getByText('Miss distance').parentElement).toHaveTextContent('6,500,634 km')
  expect(screen.getByText('Speed').parentElement).toHaveTextContent('5.69 km/s')
  expect(screen.getByText('Rotation').parentElement).toHaveTextContent('—')
  expect(screen.getByText('Mean temp').parentElement).toHaveTextContent('—')
})
