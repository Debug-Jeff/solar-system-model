import * as THREE from 'three'

const _segment = new THREE.Line3()
const _closest = new THREE.Vector3()
const FALLBACK = new THREE.Vector3(0, 0, 1)

export function insertOnPath(points: readonly THREE.Vector3[], body: THREE.Vector3): THREE.Vector3[] {
  let best = 0
  let bestDistanceSq = Number.POSITIVE_INFINITY
  for (let i = 0; i < points.length - 1; i++) {
    _segment.set(points[i]!, points[i + 1]!)
    _segment.closestPointToPoint(body, true, _closest)
    const d = _closest.distanceToSquared(body)
    if (d < bestDistanceSq) {
      bestDistanceSq = d
      best = i
    }
  }
  return [...points.slice(0, best + 1), body, ...points.slice(best + 1)]
}

export function clampOutsideSphere(point: THREE.Vector3, center: THREE.Vector3, minDistance: number): boolean {
  const distance = point.distanceTo(center)
  if (distance >= minDistance) return false
  if (distance === 0) {
    point.copy(center).addScaledVector(FALLBACK, minDistance)
    return true
  }
  point.sub(center).multiplyScalar(minDistance / distance).add(center)
  return true
}
