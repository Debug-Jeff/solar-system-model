const KM_PER_AU = 149_597_870.7

const VISUAL = {
  sunRadius: 10,
  earthRadius: 1.6,
  distBase: 18,
  distScale: 16,
}

const TRUE = {
  unitsPerAU: 12,
}

function cbrt(x) {
  return Math.cbrt(x)
}

const EARTH_RADIUS_KM = 6371
const visualK = VISUAL.earthRadius / cbrt(EARTH_RADIUS_KM)

export function planetVisualRadius(radiusKm) {
  return cbrt(radiusKm) * visualK
}

export function sunVisualRadius() {
  return VISUAL.sunRadius
}

export function moonVisualRadius(radiusKm, parentVisualRadius, parentRadiusKm) {
  return parentVisualRadius * (radiusKm / parentRadiusKm)
}

export function orbitVisualDistance(distanceAU) {
  return VISUAL.distBase + VISUAL.distScale * Math.sqrt(distanceAU)
}

export function moonVisualDistance(distanceParentKm, parentVisualRadius) {
  return parentVisualRadius * 2.6 + (distanceParentKm / 384_400) * 3.4
}

export function planetTrueRadius(radiusKm) {
  return (radiusKm / KM_PER_AU) * TRUE.unitsPerAU
}

export function sunTrueRadius() {
  return (696_340 / KM_PER_AU) * TRUE.unitsPerAU
}

export function moonTrueRadius(radiusKm) {
  return (radiusKm / KM_PER_AU) * TRUE.unitsPerAU
}

export function orbitTrueDistance(distanceAU) {
  return distanceAU * TRUE.unitsPerAU
}

export function moonTrueDistance(distanceParentKm) {
  return (distanceParentKm / KM_PER_AU) * TRUE.unitsPerAU
}
