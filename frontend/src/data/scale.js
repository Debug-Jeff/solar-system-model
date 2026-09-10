// Real distances (0.39–30 AU) and sizes (2,440–696,340 km) span too many
// orders of magnitude to render 1:1 and still see anything. "visual" mode
// compresses both onto a friendly, browsable range while preserving each
// body's relative order. "true" mode switches to real linear proportions
// so you can see just how empty space actually is and how tiny planets
// are next to it — these functions return the literal proportional size
// with no floor, so the Sun really does dwarf every planet and Phobos
// really does hug Mars. Clickability at that scale is handled separately
// by an invisible, independently-sized hit-target sphere (see bodies.js)
// rather than by inflating the visible mesh.

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

// cube-root compresses the huge radius range while keeping order intact
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

// Moon's visual orbit distance is derived independently from Earth's
// real km separation so it reads as "close" without overlapping Earth.
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
