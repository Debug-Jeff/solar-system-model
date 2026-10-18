import type { BodyType } from '../types/body'

export interface BodyImage {
  src: string
  fallback: string
  title: string
  page: string
}

const API = 'https://images-api.nasa.gov/search'
const ASSET_RE = /^https:\/\/images-assets\.nasa\.gov\/image\/[A-Za-z0-9._-]+\/[A-Za-z0-9._%~-]+~thumb\.(jpg|png)$/
const ID_RE = /^[A-Za-z0-9._-]{1,80}$/
const cache = new Map<string, Promise<BodyImage | null>>()

type Rec = Record<string, unknown>
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)

function query(name: string, type: BodyType): string {
  if (type === 'moon' && name !== 'Moon') return `${name} moon`
  if (type === 'comet') return name.toLowerCase().includes('comet') ? name : `comet ${name}`
  if (type === 'asteroid') return `asteroid ${name}`
  return name
}

function toImage(raw: unknown): BodyImage | null {
  if (!isRecord(raw) || !Array.isArray(raw.data) || !Array.isArray(raw.links)) return null
  const data = raw.data[0]
  const link = raw.links.find((l) => isRecord(l) && l.rel === 'preview')
  if (!isRecord(data) || !isRecord(link) || typeof link.href !== 'string' || !ASSET_RE.test(link.href)) return null
  if (typeof data.title !== 'string' || typeof data.nasa_id !== 'string' || !ID_RE.test(data.nasa_id)) return null
  return {
    src: link.href.replace(/~thumb\.(jpg|png)$/, '~medium.$1'),
    fallback: link.href,
    title: data.title.slice(0, 200),
    page: `https://images.nasa.gov/details/${data.nasa_id}`,
  }
}

async function lookup(name: string, type: BodyType, fetchFn: typeof fetch): Promise<BodyImage | null> {
  try {
    const params = new URLSearchParams({ q: query(name, type), media_type: 'image', page_size: '10' })
    const res = await fetchFn(`${API}?${params}`)
    if (!res.ok) throw new Error(`responded ${res.status}`)
    const json: unknown = await res.json()
    const items = isRecord(json) && isRecord(json.collection) && Array.isArray(json.collection.items) ? json.collection.items : []
    const images = items.map(toImage).filter((i): i is BodyImage => i !== null)
    const wanted = name.toLowerCase()
    return images.find((i) => i.title.toLowerCase().includes(wanted)) ?? images[0] ?? null
  } catch (err) {
    console.warn(`No NASA image for ${name}`, err)
    return null
  }
}

export function fetchBodyImage(id: string, name: string, type: BodyType, fetchFn: typeof fetch = fetch): Promise<BodyImage | null> {
  let pending = cache.get(id)
  if (!pending) {
    pending = lookup(name, type, fetchFn)
    cache.set(id, pending)
  }
  return pending
}

export function resetBodyImages(): void {
  cache.clear()
}
