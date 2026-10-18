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

test('small bodies show real radius in metres, semi-major axis, and dashes for unknowns', () => {
  const store = createAppStore(() => Date.UTC(2026, 9, 16))
  store.getState().setBodies([
    { ...base, id: 'bennu', name: 'Bennu', type: 'asteroid', radiusKm: 0.245, distanceFromSunAU: 1.126, axialTiltDeg: Number.NaN, moonCount: Number.NaN, meanTempC: Number.NaN, rotationPeriodHours: 0 },
  ])
  store.getState().select('bennu')
  render(<InfoPanel store={store} />)
  expect(screen.getByText('Radius').parentElement).toHaveTextContent('245 m')
  expect(screen.getByText('Semi-major axis').parentElement).toHaveTextContent('1.126 AU')
  expect(screen.getByText('Axial tilt').parentElement).toHaveTextContent('—')
  expect(screen.getByText('Moons').parentElement).toHaveTextContent('—')
})

test('a spacecraft shows its mission, launch date and live distances', () => {
  const store = createAppStore(() => Date.UTC(2026, 9, 16))
  store.getState().setBodies([
    { ...base, id: 'voyager-1', name: 'Voyager 1', type: 'spacecraft', parent: 'sun', radiusKm: 0.01, rotationPeriodHours: 0, axialTiltDeg: Number.NaN, meanTempC: Number.NaN, moonCount: Number.NaN, mission: { launched: '1977-09-05', description: 'Grand tour, now interstellar' } },
  ])
  store.getState().select('voyager-1')
  render(<InfoPanel store={store} />)
  expect(screen.getByText('Mission').parentElement).toHaveTextContent('Grand tour, now interstellar')
  expect(screen.getByText('Launched').parentElement).toHaveTextContent('Sep 5, 1977')
  expect(screen.queryByText('Radius')).toBeNull()
  expect(screen.queryByText('Moons')).toBeNull()
  expect(screen.getByText('From the Sun').parentElement).toHaveTextContent('—')
  expect(screen.getByText('Status').parentElement).toHaveTextContent('No trajectory data for this date')
})

import satelliteFixture from '../satellites/fixtures/frozen.json'
import { satelliteRecords } from '../satellites/catalogue'
import { parseSatellitesFile, registerSatellites, resetSatellites } from '../satellites/store'

test('a satellite shows its purpose, launch, live altitude and speed, period and element date', () => {
  resetSatellites()
  const file = parseSatellitesFile(satelliteFixture)
  registerSatellites(file)
  const epoch = Date.parse(`${file.satellites.find((s) => s.id === 'iss')!.omm.EPOCH}Z`)
  const store = createAppStore(() => epoch + 86_400_000)
  store.getState().setBodies(satelliteRecords().filter((b) => b.id === 'iss'))
  store.getState().select('iss')
  render(<InfoPanel store={store} />)
  const row = (label: string) => screen.getByText(label).parentElement!.querySelector('.stat-value')!.textContent
  expect(row('Purpose')).toBe('Crewed orbital laboratory')
  expect(row('Launched')).toBe('Nov 20, 1998')
  expect(row('Altitude')).toMatch(/^4\d\d km$/)
  expect(row('Speed')).toMatch(/^7\.6\d km\/s$/)
  expect(row('Orbital period')).toMatch(/^9\d\.\d min$/)
  expect(row('Elements')).toMatch(/^[A-Z][a-z]{2} \d{1,2}, 2026$/)
  expect(row('Status')).toBe('Tracking')
  expect(row('Position')).toBe('Accurate')
  expect(screen.queryByText('Radius')).toBeNull()
})
