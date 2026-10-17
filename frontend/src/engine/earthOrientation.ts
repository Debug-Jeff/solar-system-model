import * as THREE from 'three'
import { earthFixedToEcliptic } from '../ephemeris/earthFrame'

const _x = new THREE.Vector3()
const _y = new THREE.Vector3()
const _z = new THREE.Vector3()
const _basis = new THREE.Matrix4()

export function earthOrientation(utcMs: number, target: THREE.Quaternion): THREE.Quaternion {
  const [ex, ey, ez] = earthFixedToEcliptic(utcMs).rot as [number[], number[], number[]]
  _x.set(ex[0]!, ex[2]!, -ex[1]!)
  _y.set(ez[0]!, ez[2]!, -ez[1]!)
  _z.set(-ey[0]!, -ey[2]!, ey[1]!)
  return target.setFromRotationMatrix(_basis.makeBasis(_x, _y, _z))
}
