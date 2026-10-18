import { afterEach, expect, test, vi } from 'vitest'
import { fetchPlanets } from './client'

function mockFetch(body: unknown, status = 200) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const sun = {
  id: 'sun',
  name: 'Sun',
  type: 'star',
  radiusKm: 696340,
  orbitalPeriodDays: 0,
  rotationPeriodHours: 587,
  axialTiltDeg: 7.25,
  meanTempC: 5500,
  moonCount: 0,
  color: '#fdb813',
  facts: ['hot'],
}

test('fetchPlanets returns data.bodies', async () => {
  mockFetch({ bodies: [sun] })
  const bodies = await fetchPlanets()
  expect(bodies[0]!.id).toBe('sun')
})

test('non-2xx rejects with url and status', async () => {
  mockFetch({}, 503)
  await expect(fetchPlanets()).rejects.toThrow('/api/planets responded 503')
})



test('fetchPlanets rejects when bodies is not an array', async () => {
  mockFetch({ bodies: null })
  await expect(fetchPlanets()).rejects.toThrow()
})

test('fetchPlanets rejects a body with an unknown type', async () => {
  mockFetch({ bodies: [{ ...sun, type: 'blackHole' }] })
  await expect(fetchPlanets()).rejects.toThrow()
})
