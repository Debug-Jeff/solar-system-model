import { isBodyType, type Body } from '../types/body'

export const API_BASE: string = import.meta.env.VITE_API_BASE_URL || ''

export interface ApodResponse {
  title: string
  date?: string
  url: string
  hdurl?: string
  explanation: string
  media_type?: string
}

export interface EpicItem {
  date: string
  caption: string
  imageUrl: string
}

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function getJSON(path: string): Promise<unknown> {
  const url = API_BASE + path
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`${url} responded ${res.status}`)
  }
  return res.json()
}

function toBody(value: unknown): Body {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.name !== 'string' || !isBodyType(value.type)) {
    throw new Error('invalid body in /api/planets')
  }
  if (!Array.isArray(value.facts) || !value.facts.every((f) => typeof f === 'string')) {
    throw new Error(`invalid facts for body ${value.id}`)
  }
  return value as unknown as Body
}

export async function fetchPlanets(): Promise<Body[]> {
  const data = await getJSON('/api/planets')
  if (!isObject(data) || !Array.isArray(data.bodies)) {
    throw new Error('invalid /api/planets response')
  }
  return data.bodies.map(toBody)
}

export async function fetchApod(): Promise<ApodResponse> {
  const data = await getJSON('/api/apod')
  if (!isObject(data) || typeof data.title !== 'string' || typeof data.url !== 'string') {
    throw new Error('invalid /api/apod response')
  }
  return {
    title: data.title,
    url: data.url,
    explanation: typeof data.explanation === 'string' ? data.explanation : '',
    ...(typeof data.date === 'string' ? { date: data.date } : {}),
    ...(typeof data.hdurl === 'string' ? { hdurl: data.hdurl } : {}),
    ...(typeof data.media_type === 'string' ? { media_type: data.media_type } : {}),
  }
}

export async function fetchLatestEpic(): Promise<EpicItem> {
  const items = await getJSON('/api/epic')
  if (!Array.isArray(items)) throw new Error('invalid /api/epic response')
  const item: unknown = items[items.length - 1]
  if (item === undefined) throw new Error('no EPIC imagery available')
  if (!isObject(item) || typeof item.imageUrl !== 'string' || typeof item.date !== 'string') {
    throw new Error('invalid EPIC item')
  }
  return {
    date: item.date,
    caption: typeof item.caption === 'string' ? item.caption : '',
    imageUrl: API_BASE + item.imageUrl,
  }
}
