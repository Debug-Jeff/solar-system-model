import * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { createCameraFlight } from './flyTo'

export interface FollowController {
  start(distanceKm: number, nowMs: number): void
  stop(): void
  update(target: THREE.Vector3, nowMs: number): void
}

export function createFollowController(camera: THREE.PerspectiveCamera, controls: OrbitControls): FollowController {
  const flight = createCameraFlight(camera, controls)
  const lastTarget = new THREE.Vector3()
  const displacement = new THREE.Vector3()
  let active = false
  let pendingStart: { distanceKm: number; nowMs: number } | null = null

  return {
    start(distanceKm, nowMs) {
      active = true
      pendingStart = { distanceKm, nowMs }
    },
    stop() {
      active = false
      pendingStart = null
    },
    update(target, nowMs) {
      if (!active) return
      if (pendingStart) {
        flight.start(target, pendingStart.distanceKm, pendingStart.nowMs)
        pendingStart = null
        lastTarget.copy(target)
      }
      if (flight.active) {
        flight.update(target, nowMs)
        lastTarget.copy(target)
        return
      }
      displacement.copy(target).sub(lastTarget)
      camera.position.add(displacement)
      controls.target.add(displacement)
      lastTarget.copy(target)
    },
  }
}
