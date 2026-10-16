import { afterEach, expect, test, vi } from 'vitest'
import { loadEphemSet } from './loader'

const valid = (generatedAt: string) => ({
  version: 1,
  set: 'moons-earth',
  generatedAt,
  startJd: 2461299.5,
  bodies: { moon: { center: 'earth', stepMinutes: 1440, count: 2, states: [1, 2, 3, 0, 0, 0, 4, 5, 6, 0, 0, 0] } },
})

function fakeFetch(routes: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    if (!(url in routes)) return new Response('missing', { status: 404 })
    const body = routes[url]
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200 })
  }) as unknown as typeof fetch
}

afterEach(() => vi.restoreAllMocks())

test('static snapshot is used when the backend is down', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const set = await loadEphemSet('moons-earth', { fetch: fakeFetch({ '/data/ephem/moons-earth.json': valid('2026-10-16T00:00:00Z') }), apiBase: 'https://api.test' })
  expect(set?.generatedAtMs).toBe(Date.UTC(2026, 9, 16))
})

test('a newer backend set wins', async () => {
  const set = await loadEphemSet('moons-earth', {
    fetch: fakeFetch({
      '/data/ephem/moons-earth.json': valid('2026-10-16T00:00:00Z'),
      'https://api.test/api/ephem/moons-earth': valid('2026-10-17T00:00:00Z'),
    }),
    apiBase: 'https://api.test',
  })
  expect(set?.generatedAtMs).toBe(Date.UTC(2026, 9, 17))
})

test('a malformed static file falls back to the backend', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const set = await loadEphemSet('moons-earth', {
    fetch: fakeFetch({ '/data/ephem/moons-earth.json': '{"version":1,"set":"moons-earth"', 'https://api.test/api/ephem/moons-earth': valid('2026-10-15T00:00:00Z') }),
    apiBase: 'https://api.test',
  })
  expect(set?.generatedAtMs).toBe(Date.UTC(2026, 9, 15))
})

test('both bad resolves to null without throwing', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  expect(await loadEphemSet('moons-earth', { fetch: fakeFetch({}), apiBase: '' })).toBeNull()
})

test('unknown set names are refused before any request', async () => {
  const f = fakeFetch({})
  expect(await loadEphemSet('../../etc/passwd', { fetch: f, apiBase: '' })).toBeNull()
  expect(f).not.toHaveBeenCalled()
})
