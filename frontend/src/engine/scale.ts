const VISUAL = {
  sunRadius: 10,
  earthRadius: 1.6,
  distBase: 18,
  distScale: 16,
}

const EARTH_RADIUS_KM = 6371
const visualK = VISUAL.earthRadius / Math.cbrt(EARTH_RADIUS_KM)

export function planetVisualRadius(radiusKm: number): number {
  return Math.cbrt(radiusKm) * visualK
}

export function sunVisualRadius(): number {
  return VISUAL.sunRadius
}

export function moonVisualRadius(radiusKm: number, parentVisualRadius: number, parentRadiusKm: number): number {
  return parentVisualRadius * (radiusKm / parentRadiusKm)
}

export function orbitVisualDistance(distanceAU: number): number {
  return VISUAL.distBase + VISUAL.distScale * Math.sqrt(distanceAU)
}

export function moonVisualDistance(distanceParentKm: number, parentVisualRadius: number): number {
  return parentVisualRadius * 2.6 + (distanceParentKm / 384_400) * 3.4
}
