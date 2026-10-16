import * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export const FLIGHT_MS = 1200
const FLY_TO_RADII = 4
const MIN_FLY_TO_KM = 0.05
const FALLBACK_DIRECTION = new THREE.Vector3(0, 0.35, 1).normalize()

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export function flyToDistance(radiusKm: number): number {
  return Math.max(radiusKm * FLY_TO_RADII, MIN_FLY_TO_KM)
}

export interface CameraFlight {
  readonly active: boolean
  start(distanceKm: number, nowMs: number): void
  update(targetKm: THREE.Vector3, nowMs: number): boolean
}

export function createCameraFlight(camera: THREE.PerspectiveCamera, controls: OrbitControls): CameraFlight {
  const fromCamera = new THREE.Vector3()
  const fromTarget = new THREE.Vector3()
  const direction = new THREE.Vector3()
  const endCamera = new THREE.Vector3()
  let startMs = 0
  let distance = 0
  let active = false

  return {
    get active() {
      return active
    },
    start(distanceKm, nowMs) {
      fromCamera.copy(camera.position)
      fromTarget.copy(controls.target)
      direction.copy(camera.position).sub(controls.target)
      if (direction.lengthSq() === 0) direction.copy(FALLBACK_DIRECTION)
      direction.normalize()
      distance = distanceKm
      startMs = nowMs
      active = true
    },
    update(targetKm, nowMs) {
      if (!active) return false
      const t = Math.min(1, Math.max(0, (nowMs - startMs) / FLIGHT_MS))
      const e = easeInOutCubic(t)
      endCamera.copy(targetKm).addScaledVector(direction, distance)
      controls.target.lerpVectors(fromTarget, targetKm, e)
      camera.position.lerpVectors(fromCamera, endCamera, e)
      if (t >= 1) active = false
      return active
    },
  }
}
