import { afterEach, expect, test, vi } from 'vitest'
import { fetchBodyImage, resetBodyImages } from './bodyImage'
import { READ_MORE } from './readMore'

afterEach(() => {
  vi.restoreAllMocks()
  resetBodyImages()
})

const item = (title: string, href: string, id = 'PIA1') => ({ data: [{ title, nasa_id: id }], links: [{ href, rel: 'preview' }] })
const respond = (items: unknown[]) => vi.fn(async () => new Response(JSON.stringify({ collection: { items } }), { status: 200 })) as unknown as typeof fetch

test('prefers a result titled with the body name, and asks for the medium size', async () => {
  const fetchFn = respond([item('Plume', 'https://images-assets.nasa.gov/image/A/A~thumb.jpg', 'A'), item('Jupiter in true color', 'https://images-assets.nasa.gov/image/B/B~thumb.jpg', 'B')])
  const image = await fetchBodyImage('jupiter', 'Jupiter', 'planet', fetchFn)
  expect(image).toEqual({ src: 'https://images-assets.nasa.gov/image/B/B~medium.jpg', fallback: 'https://images-assets.nasa.gov/image/B/B~thumb.jpg', title: 'Jupiter in true color', page: 'https://images.nasa.gov/details/B' })
})

test('rejects images from anywhere but NASA and caches each body once', async () => {
  const fetchFn = respond([item('Mars', 'https://evil.example/x.jpg'), item('Mars', 'javascript:alert(1)')])
  expect(await fetchBodyImage('mars', 'Mars', 'planet', fetchFn)).toBeNull()
  expect(await fetchBodyImage('mars', 'Mars', 'planet', fetchFn)).toBeNull()
  expect(fetchFn).toHaveBeenCalledOnce()
})

test('a failed lookup resolves null', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const fetchFn = vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof fetch
  expect(await fetchBodyImage('io', 'Io', 'moon', fetchFn)).toBeNull()
})

test('read-more links only point at NASA', () => {
  for (const url of Object.values(READ_MORE)) expect(url).toMatch(/^https:\/\/(science|www)\.nasa\.gov\//)
  expect(READ_MORE.mars).toBe('https://science.nasa.gov/mars/')
})
