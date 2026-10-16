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

test('a newer backend set is delivered through onUpdate after the static one', async () => {
  const onUpdate = vi.fn()
  const set = await loadEphemSet('moons-earth', {
    fetch: fakeFetch({
      '/data/ephem/moons-earth.json': valid('2026-10-16T00:00:00Z'),
      'https://api.test/api/ephem/moons-earth': valid('2026-10-17T00:00:00Z'),
    }),
    apiBase: 'https://api.test',
    onUpdate,
  })
  expect(set?.generatedAtMs).toBe(Date.UTC(2026, 9, 16))
  await vi.waitFor(() => expect(onUpdate.mock.calls[0]?.[0].generatedAtMs).toBe(Date.UTC(2026, 9, 17)))
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

test('the static set is returned immediately even if the backend never answers, and a newer backend set arrives via onUpdate', async () => {
  let release!: (r: Response) => void
  const hanging = new Promise<Response>((resolve) => (release = resolve))
  const f = vi.fn(async (url: string) => {
    if (url === '/data/ephem/moons-earth.json') return new Response(JSON.stringify(valid('2026-10-16T00:00:00Z')))
    return hanging
  }) as unknown as typeof fetch
  const onUpdate = vi.fn()
  const set = await loadEphemSet('moons-earth', { fetch: f, apiBase: 'https://api.test', onUpdate })
  expect(set?.generatedAtMs).toBe(Date.UTC(2026, 9, 16))
  expect(onUpdate).not.toHaveBeenCalled()
  release(new Response(JSON.stringify(valid('2026-10-17T00:00:00Z'))))
  await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1))
  expect(onUpdate.mock.calls[0]![0].generatedAtMs).toBe(Date.UTC(2026, 9, 17))
})

test('an older backend set does not trigger onUpdate', async () => {
  const onUpdate = vi.fn()
  await loadEphemSet('moons-earth', {
    fetch: fakeFetch({ '/data/ephem/moons-earth.json': valid('2026-10-16T00:00:00Z'), 'https://api.test/api/ephem/moons-earth': valid('2026-10-15T00:00:00Z') }),
    apiBase: 'https://api.test',
    onUpdate,
  })
  await new Promise((r) => setTimeout(r, 10))
  expect(onUpdate).not.toHaveBeenCalled()
})

test('moons-pluto is an allowed set', async () => {
  const { isEphemSetName } = await import('./loader')
  expect(isEphemSetName('moons-pluto')).toBe(true)
})
