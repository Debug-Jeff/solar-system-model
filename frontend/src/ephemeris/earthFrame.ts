import { CombineRotation, MakeTime, RotationMatrix, Rotation_EQD_EQJ, Rotation_EQJ_ECL, SiderealTime } from 'astronomy-engine'

const DEG = Math.PI / 180
const MS_PER_HOUR = 3_600_000
export const EQJ_TO_ECL = Rotation_EQJ_ECL()

let cachedHour = Number.NaN
let cachedEqdToEcl: RotationMatrix = EQJ_TO_ECL

export function equatorOfDateToEcliptic(utcMs: number): RotationMatrix {
  const hour = Math.floor(utcMs / MS_PER_HOUR)
  if (hour !== cachedHour) {
    cachedHour = hour
    cachedEqdToEcl = CombineRotation(Rotation_EQD_EQJ(MakeTime(new Date(hour * MS_PER_HOUR))), EQJ_TO_ECL)
  }
  return cachedEqdToEcl
}

export function earthFixedToEcliptic(utcMs: number): RotationMatrix {
  const theta = SiderealTime(MakeTime(new Date(utcMs))) * 15 * DEG
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  return CombineRotation(new RotationMatrix([[c, s, 0], [-s, c, 0], [0, 0, 1]]), equatorOfDateToEcliptic(utcMs))
}
