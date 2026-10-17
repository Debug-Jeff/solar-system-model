import { registerKeplerBody } from './ephemeris'
import type { NamedSmallBody, NeoApproach, SmallBodiesData } from './ephemeris/smallBodies'
import type { Body } from './types/body'

const COLORS = { asteroid: '#a89880', comet: '#bcd6ff', dwarfPlanet: '#c8b8a8' }

function namedRecord(b: NamedSmallBody): Body {
  return {
    id: b.id,
    name: b.name,
    type: b.type,
    radiusKm: b.radiusKm,
    distanceFromSunAU: b.elements.a,
    orbitalEccentricity: b.elements.e,
    orbitalInclinationDeg: b.elements.i,
    orbitalPeriodDays: 360 / b.elements.n,
    rotationPeriodHours: 0,
    axialTiltDeg: Number.NaN,
    meanTempC: Number.NaN,
    moonCount: Number.NaN,
    color: COLORS[b.type],
    facts: [],
  }
}

function neoRecord(n: NeoApproach): Body {
  return {
    ...namedRecord({ id: n.id, name: n.name, type: 'asteroid', radiusKm: Math.max(n.diameterKm / 2, 0.001), elements: n.elements }),
    neo: { approachMs: n.approachMs, missKm: n.missKm, speedKmS: n.speedKmS, hazardous: n.hazardous },
  }
}

export function appendUnique(base: Body[], records: Body[]): Body[] {
  const ids = new Set(base.map((b) => b.id))
  const out = [...base]
  for (const record of records) {
    if (ids.has(record.id)) {
      console.warn(`${record.id} duplicates an existing body; keeping the original`)
      continue
    }
    ids.add(record.id)
    out.push(record)
  }
  return out
}

export function mergeSmallBodies(base: Body[], data: SmallBodiesData): Body[] {
  const ids = new Set(base.map((b) => b.id))
  const out = [...base]
  const add = (record: Body, register: () => void) => {
    if (ids.has(record.id)) {
      console.warn(`small bodies: ${record.id} duplicates an existing body; keeping the original`)
      return
    }
    ids.add(record.id)
    register()
    out.push(record)
  }
  for (const b of data.named) add(namedRecord(b), () => registerKeplerBody(b.id, b.elements, b.type))
  for (const n of data.neos) add(neoRecord(n), () => registerKeplerBody(n.id, n.elements, 'neo'))
  return out
}
