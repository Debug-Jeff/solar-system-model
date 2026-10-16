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
  { ...base, id: 'mars', name: 'Mars', type: 'planet', distanceFromSunAU: 1.52 },
  { ...base, id: 'halley', name: "Halley's Comet", type: 'comet', distanceFromSunAU: 17.8 },
]

test.each([
  ['mars', 'Live'],
  ['halley', 'Approximate'],
])('%s position reads %s', (id, label) => {
  const store = createAppStore(() => Date.UTC(2026, 9, 16))
  store.getState().setBodies(bodies)
  store.getState().select(id)
  render(<InfoPanel store={store} />)
  const row = screen.getByText('Position').parentElement!
  expect(row).toHaveTextContent(label)
})
