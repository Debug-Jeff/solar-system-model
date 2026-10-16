import * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export const FOLLOW_SMOOTHNESS = 0.08
export const FOLLOW_CAM_DISTANCE = 18

export interface FollowController {
  start(): void
  stop(): void
  update(target: THREE.Vector3): void
}

export function createFollowController(camera: THREE.PerspectiveCamera, controls: OrbitControls): FollowController {
  let active = false
  let initialized = false
  const offset = new THREE.Vector3()
  const desiredCam = new THREE.Vector3()

  return {
    start() {
      active = true
      initialized = false
    },
    stop() {
      active = false
      initialized = false
    },
    update(target) {
      if (!active) return
      if (!initialized) {
        offset.copy(camera.position).sub(controls.target).normalize().multiplyScalar(FOLLOW_CAM_DISTANCE)
        camera.position.copy(target).add(offset)
        controls.target.copy(target)
        initialized = true
        return
      }
      offset.copy(camera.position).sub(controls.target)
      desiredCam.copy(target).add(offset)
      camera.position.lerp(desiredCam, FOLLOW_SMOOTHNESS)
      controls.target.lerp(target, FOLLOW_SMOOTHNESS)
    },
  }
}
