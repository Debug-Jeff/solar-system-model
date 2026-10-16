import { Body, HelioVector, MakeTime, RotateVector, Rotation_EQJ_ECL } from 'astronomy-engine'
import type { PlanetId, Vec3 } from './types'

const BODIES: Record<PlanetId, Body> = {
  mercury: Body.Mercury,
  venus: Body.Venus,
  earth: Body.Earth,
  mars: Body.Mars,
  jupiter: Body.Jupiter,
  saturn: Body.Saturn,
  uranus: Body.Uranus,
  neptune: Body.Neptune,
  pluto: Body.Pluto,
}

export const PLANET_PERIOD_DAYS: Record<PlanetId, number> = {
  mercury: 87.969,
  venus: 224.701,
  earth: 365.256,
  mars: 686.98,
  jupiter: 4332.59,
  saturn: 10759.22,
  uranus: 30688.5,
  neptune: 60182,
  pluto: 90560,
}

const EQJ_TO_ECL = Rotation_EQJ_ECL()

export function planetPosition(id: PlanetId, utcMs: number): Vec3 {
  const v = RotateVector(EQJ_TO_ECL, HelioVector(BODIES[id], MakeTime(new Date(utcMs))))
  return { x: v.x, y: v.y, z: v.z }
}
