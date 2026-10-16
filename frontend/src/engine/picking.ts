import * as THREE from 'three'

export interface ScreenPoint {
  x: number
  y: number
}

export function isClick(down: ScreenPoint, up: ScreenPoint, thresholdPx = 5): boolean {
  return Math.hypot(up.x - down.x, up.y - down.y) <= thresholdPx
}

const raycaster = new THREE.Raycaster()
const ndc = new THREE.Vector2()

export function pickBody(
  point: ScreenPoint,
  element: HTMLElement,
  camera: THREE.Camera,
  targets: THREE.Object3D[]
): string | null {
  const rect = element.getBoundingClientRect()
  ndc.x = ((point.x - rect.left) / rect.width) * 2 - 1
  ndc.y = -((point.y - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(ndc, camera)
  const hit = raycaster.intersectObjects(targets, false)[0]
  const id: unknown = hit?.object.userData.bodyId
  return typeof id === 'string' ? id : null
}
