import { isBodyType, type Body } from '../types/body'

export const API_BASE: string = import.meta.env.VITE_API_BASE_URL || ''



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


