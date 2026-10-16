import { GeoMoon, MakeTime, RotateVector, Rotation_EQJ_ECL } from 'astronomy-engine'
import { expect, test } from 'vitest'
import earthSet from './fixtures/moons-frozen/moons-earth.json'
import jupiterSet from './fixtures/moons-frozen/moons-jupiter.json'
import marsSet from './fixtures/moons-frozen/moons-mars.json'
import reference from './fixtures/moons-frozen/reference.json'
import { parseEphemSet, sampledPosition } from './sampled'
import { UNIX_EPOCH_JD, type Vec3 } from './types'

const AU_KM = 149_597_870.7
type Row = { jd: number; x: number; y: number; z: number }
const refs = reference as Record<string, Row[]>
const jdToMs = (jd: number) => (jd - UNIX_EPOCH_JD) * 86_400_000
const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const norm = (a: Vec3) => Math.hypot(a.x, a.y, a.z)

const tracks = {
  moon: parseEphemSet(earthSet, 'moons-earth').bodies.moon!,
  phobos: parseEphemSet(marsSet, 'moons-mars').bodies.phobos!,
  io: parseEphemSet(jupiterSet, 'moons-jupiter').bodies.io!,
}

const cases = (Object.keys(tracks) as (keyof typeof tracks)[]).flatMap((id) => refs[id]!.map((row) => [id, row] as const))

test('every body has three off-grid reference times', () => {
  expect(cases).toHaveLength(9)
})

test.each(cases)('%s at JD %o is within 1%% of its orbit radius of Horizons', (id, row) => {
  const p = sampledPosition(tracks[id], jdToMs(row.jd))
  expect(p).not.toBeNull()
  expect(dist(p!, row) / norm(row)).toBeLessThan(0.01)
})

test.each(refs.moon!.map((row) => [row] as const))('the Moon at JD %o agrees with astronomy-engine within 1%%', (row) => {
  const ms = jdToMs(row.jd)
  const v = RotateVector(Rotation_EQJ_ECL(), GeoMoon(MakeTime(new Date(ms))))
  const independent = { x: v.x * AU_KM, y: v.y * AU_KM, z: v.z * AU_KM }
  const p = sampledPosition(tracks.moon, ms)!
  expect(dist(p, independent) / norm(independent)).toBeLessThan(0.01)
})
