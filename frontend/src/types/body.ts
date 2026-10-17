export const BODY_TYPES = ['star', 'planet', 'dwarfPlanet', 'moon', 'comet', 'asteroid', 'spacecraft'] as const

export type BodyType = (typeof BODY_TYPES)[number]

export interface Body {
  id: string
  name: string
  type: BodyType
  radiusKm: number
  distanceFromSunAU?: number
  distanceFromParentKm?: number
  parent?: string
  orbitalEccentricity?: number
  orbitalInclinationDeg?: number
  orbitalPeriodDays: number
  rotationPeriodHours: number
  axialTiltDeg: number
  meanTempC: number
  moonCount: number
  color?: string
  retrograde?: boolean
  hasRings?: boolean
  mission?: { launched: string; description: string }
  neo?: { approachMs: number; missKm: number; speedKmS: number; hazardous: boolean }
  facts: string[]
}

export function isBodyType(value: unknown): value is BodyType {
  return typeof value === 'string' && (BODY_TYPES as readonly string[]).includes(value)
}
