import type * as THREE from 'three'

export function zoomCamera(camera: THREE.Vector3, target: THREE.Vector3, factor: number, minDistance: number, maxDistance: number): void {
  const offset = camera.clone().sub(target)
  const distance = Math.min(maxDistance, Math.max(minDistance, offset.length() * factor))
  camera.copy(target).add(offset.setLength(distance))
}
