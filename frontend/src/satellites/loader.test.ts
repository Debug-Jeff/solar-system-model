import { afterEach, expect, test, vi } from 'vitest'
import frozen from './fixtures/frozen.json'
import { loadSatellites } from './loader'

const at = (generatedAt: string) => ({ ...frozen, generatedAt })

function fakeFetch(routes: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    if (!(url in routes)) return new Response('missing', { status: 404 })
    return new Response(JSON.stringify(routes[url]), { status: 200 })
  }) as unknown as typeof fetch
}

afterEach(() => vi.restoreAllMocks())

test('the static snapshot is used when the backend is down', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const file = await loadSatellites({ fetch: fakeFetch({ '/data/satellites.json': at('2026-10-16T00:00:00Z') }), apiBase: 'https://api.test' })
  expect(file?.generatedAtMs).toBe(Date.UTC(2026, 9, 16))
  expect(file?.satellites.length).toBe(4)
})

test('newer backend data arrives through onUpdate; older is ignored', async () => {
  const onUpdate = vi.fn()
  await loadSatellites({
    fetch: fakeFetch({ '/data/satellites.json': at('2026-10-16T00:00:00Z'), 'https://api.test/api/satellites': at('2026-10-16T02:00:00Z') }),
    apiBase: 'https://api.test',
    onUpdate,
  })
  await vi.waitFor(() => expect(onUpdate.mock.calls[0]?.[0].generatedAtMs).toBe(Date.UTC(2026, 9, 16, 2)))
  const stale = vi.fn()
  await loadSatellites({
    fetch: fakeFetch({ '/data/satellites.json': at('2026-10-16T00:00:00Z'), 'https://api.test/api/satellites': at('2026-10-15T00:00:00Z') }),
    apiBase: 'https://api.test',
    onUpdate: stale,
  })
  await new Promise((r) => setTimeout(r, 20))
  expect(stale).not.toHaveBeenCalled()
})

test('the backend answers when the static file is missing', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const file = await loadSatellites({ fetch: fakeFetch({ 'https://api.test/api/satellites': at('2026-10-16T02:00:00Z') }), apiBase: 'https://api.test' })
  expect(file?.generatedAtMs).toBe(Date.UTC(2026, 9, 16, 2))
})
