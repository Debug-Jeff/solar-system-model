export interface PlanarPoint {
  x: number
  z: number
}

export function ellipticalPosition(theta: number, semiMajorAxis: number, eccentricity: number): PlanarPoint {
  const r = (semiMajorAxis * (1 - eccentricity * eccentricity)) / (1 + eccentricity * Math.cos(theta))
  return { x: r * Math.cos(theta), z: r * Math.sin(theta) }
}

export function eccentricAnomaly(meanAnomaly: number, eccentricity: number): number {
  const m = ((meanAnomaly % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  let e = m + eccentricity * Math.sin(m)
  for (let i = 0; i < 8; i++) {
    const delta = (e - eccentricity * Math.sin(e) - m) / (1 - eccentricity * Math.cos(e))
    e -= delta
    if (Math.abs(delta) < 1e-9) break
  }
  return e
}

export function keplerianPosition(meanAnomaly: number, semiMajorAxis: number, eccentricity: number): PlanarPoint {
  const E = eccentricAnomaly(meanAnomaly, eccentricity)
  const theta = 2 * Math.atan2(
    Math.sqrt(1 + eccentricity) * Math.sin(E / 2),
    Math.sqrt(1 - eccentricity) * Math.cos(E / 2)
  )
  const r = semiMajorAxis * (1 - eccentricity * Math.cos(E))
  return { x: r * Math.cos(theta), z: r * Math.sin(theta) }
}

export function ellipsePoints(semiMajorAxis: number, eccentricity: number, segments = 256): number[] {
  const points: number[] = []
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2
    const { x, z } = ellipticalPosition(theta, semiMajorAxis, eccentricity)
    points.push(x, 0, z)
  }
  return points
}
