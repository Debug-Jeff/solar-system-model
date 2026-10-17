import { sampledPosition, type EphemSet, type SampledTrack } from './sampled'
import { MS_PER_DAY, type Availability, type Vec3 } from './types'

const SET_FOR_PLANET: Record<string, string> = {
  earth: 'moons-earth',
  mars: 'moons-mars',
  jupiter: 'moons-jupiter',
  saturn: 'moons-saturn',
  uranus: 'moons-uranus',
  neptune: 'moons-neptune',
  pluto: 'moons-pluto',
}

const sets = new Map<string, EphemSet>()
const tracks = new Map<string, SampledTrack>()
const listeners = new Set<(set: string) => void>()

function rebuildIndex(): void {
  tracks.clear()
  for (const set of sets.values()) {
    for (const [id, track] of Object.entries(set.bodies)) tracks.set(id, track)
  }
}

export function moonSetFor(parentId: string): string | null {
  return SET_FOR_PLANET[parentId] ?? null
}

export function registerSet(set: EphemSet): void {
  const current = sets.get(set.set)
  if (current && set.generatedAtMs < current.generatedAtMs) return
  sets.set(set.set, set)
  rebuildIndex()
  for (const listener of listeners) listener(set.set)
}

export function onSetRegistered(listener: (set: string) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function knowsMoon(id: string): boolean {
  return tracks.has(id)
}

export function moonPosition(id: string, utcMs: number): Vec3 | null {
  const track = tracks.get(id)
  return track ? sampledPosition(track, utcMs) : null
}

export function trackCoverage(id: string): { startMs: number; endMs: number } | null {
  const track = tracks.get(id)
  return track ? { startMs: track.startMs, endMs: track.startMs + (track.count - 1) * track.stepMs } : null
}

export function moonAvailability(id: string, utcMs: number): Availability {
  return moonPosition(id, utcMs) ? 'exact' : 'approximate'
}

export function moonOrbitPath(id: string, utcMs: number, periodDays: number, samples = 180): Vec3[] {
  const track = tracks.get(id)
  if (!track || !(periodDays > 0)) return []
  const periodMs = periodDays * MS_PER_DAY
  const start = utcMs - periodMs / 2
  const points: Vec3[] = []
  for (let i = 0; i <= samples; i++) {
    const p = sampledPosition(track, start + (periodMs * i) / samples)
    if (p) points.push(p)
  }
  return points
}

export function resetMoonStore(): void {
  sets.clear()
  tracks.clear()
  listeners.clear()
}
