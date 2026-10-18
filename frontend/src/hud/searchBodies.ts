import type { Body, BodyType } from '../types/body'

const TYPE_ORDER: BodyType[] = ['star', 'planet', 'dwarfPlanet', 'moon', 'spacecraft', 'satellite', 'comet', 'asteroid']

function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function rank(body: Body, q: string): number {
  const name = fold(body.name)
  if (name === q || fold(body.id) === q) return 0
  if (name.startsWith(q) || name.split(/[\s()\-/]+/).some((word) => word.startsWith(q))) return 1
  if (name.includes(q)) return 2
  return -1
}

export function searchBodies(bodies: readonly Body[], query: string, limit = 8): Body[] {
  const q = fold(query.trim())
  if (!q) return []
  return bodies
    .map((body) => ({ body, score: rank(body, q) }))
    .filter((r) => r.score >= 0)
    .sort((a, b) => a.score - b.score || TYPE_ORDER.indexOf(a.body.type) - TYPE_ORDER.indexOf(b.body.type) || a.body.name.localeCompare(b.body.name))
    .slice(0, limit)
    .map((r) => r.body)
}
