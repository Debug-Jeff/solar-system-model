import { afterEach, expect, test, vi } from 'vitest'
import { API_BASE, fetchApod, fetchLatestEpic, fetchPlanets } from './client'

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
  await expect(fetchApod()).rejects.toThrow('/api/apod responded 503')
})

test('fetchLatestEpic picks the last item and prefixes imageUrl', async () => {
  mockFetch([
    { imageUrl: '/api/epic/image?a', date: '2026-10-14 00:00:00', caption: 'a' },
    { imageUrl: '/api/epic/image?b', date: '2026-10-15 00:00:00', caption: 'c' },
  ])
  const item = await fetchLatestEpic()
  expect(item.imageUrl).toBe(API_BASE + '/api/epic/image?b')
  expect(item.caption).toBe('c')
})

test('fetchLatestEpic rejects on an empty list', async () => {
  mockFetch([])
  await expect(fetchLatestEpic()).rejects.toThrow('no EPIC imagery available')
})

test('fetchPlanets rejects when bodies is not an array', async () => {
  mockFetch({ bodies: null })
  await expect(fetchPlanets()).rejects.toThrow()
})

test('fetchPlanets rejects a body with an unknown type', async () => {
  mockFetch({ bodies: [{ ...sun, type: 'blackHole' }] })
  await expect(fetchPlanets()).rejects.toThrow()
})
