import * as THREE from 'three'

const NDC_MARGIN = 1.2
const _ndc = new THREE.Vector3()

export function projectedRadiusPx(radiusKm: number, distanceKm: number, fovYRad: number, viewportHeightPx: number): number {
  if (distanceKm <= radiusKm) return Number.POSITIVE_INFINITY
  return (radiusKm / (distanceKm * Math.tan(fovYRad / 2))) * (viewportHeightPx / 2)
}

export interface ScreenProjection {
  x: number
  y: number
  visible: boolean
}

export function projectToScreen(world: THREE.Vector3, camera: THREE.Camera, width: number, height: number): ScreenProjection {
  _ndc.copy(world).project(camera)
  const visible = _ndc.z <= 1 && Math.abs(_ndc.x) <= NDC_MARGIN && Math.abs(_ndc.y) <= NDC_MARGIN
  return { x: ((_ndc.x + 1) / 2) * width, y: ((1 - _ndc.y) / 2) * height, visible }
}
