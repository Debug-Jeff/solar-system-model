import { msToJd, type OrbitalElements, type Vec3 } from './types'

const DEG = Math.PI / 180
const TWO_PI = 2 * Math.PI
const MAX_ITERATIONS = 50
const TOLERANCE = 1e-12

export function eccentricAnomaly(meanAnomaly: number, eccentricity: number): number {
  const m = ((meanAnomaly % TWO_PI) + TWO_PI) % TWO_PI
  let e = eccentricity > 0.8 ? Math.PI : m + eccentricity * Math.sin(m)
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const delta = (e - eccentricity * Math.sin(e) - m) / (1 - eccentricity * Math.cos(e))
    e -= delta
    if (Math.abs(delta) < TOLERANCE) break
  }
  return e
}

export function validateElements(el: OrbitalElements): void {
  for (const [key, value] of Object.entries(el)) {
    if (!Number.isFinite(value)) throw new Error(`orbital element ${key} is not finite`)
  }
  if (el.e < 0 || el.e >= 1) throw new Error(`eccentricity ${el.e} is outside [0, 1)`)
  if (el.a <= 0) throw new Error(`semi-major axis ${el.a} must be positive`)
  if (el.n <= 0) throw new Error(`mean motion ${el.n} must be positive`)
}

export function periodDays(el: OrbitalElements): number {
  return 360 / el.n
}

export function elementsPosition(el: OrbitalElements, utcMs: number): Vec3 {
  const meanAnomaly = (el.ma + el.n * (msToJd(utcMs) - el.epochJd)) * DEG
  const E = eccentricAnomaly(meanAnomaly, el.e)
  const xp = el.a * (Math.cos(E) - el.e)
  const yp = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E)
  const cosO = Math.cos(el.om * DEG)
  const sinO = Math.sin(el.om * DEG)
  const cosW = Math.cos(el.w * DEG)
  const sinW = Math.sin(el.w * DEG)
  const cosI = Math.cos(el.i * DEG)
  const sinI = Math.sin(el.i * DEG)
  return {
    x: (cosO * cosW - sinO * sinW * cosI) * xp + (-cosO * sinW - sinO * cosW * cosI) * yp,
    y: (sinO * cosW + cosO * sinW * cosI) * xp + (-sinO * sinW + cosO * cosW * cosI) * yp,
    z: sinW * sinI * xp + cosW * sinI * yp,
  }
}
