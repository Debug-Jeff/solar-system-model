import * as THREE from 'three'

export const MILKY_WAY_RADIUS_KM = 1.5e10
const BRIGHTNESS = 0.9
const EPS = (23.4392911 * Math.PI) / 180

export function milkyWayBasis(): THREE.Matrix4 {
  const imageToEquatorial = new THREE.Matrix3().set(1, 0, 0, 0, 0, 1, 0, 1, 0)
  const c = Math.cos(EPS)
  const s = Math.sin(EPS)
  const equatorialToEcliptic = new THREE.Matrix3().set(1, 0, 0, 0, c, s, 0, -s, c)
  const eclipticToScene = new THREE.Matrix3().set(1, 0, 0, 0, 0, 1, 0, -1, 0)
  const basis = eclipticToScene.multiply(equatorialToEcliptic).multiply(imageToEquatorial)
  return new THREE.Matrix4().setFromMatrix3(basis)
}

export interface MilkyWay {
  mesh: THREE.Mesh
  update(camera: THREE.Camera): void
  dispose(): void
}

export function createMilkyWay(scene: THREE.Scene, texture: THREE.Texture): MilkyWay {
  const geometry = new THREE.SphereGeometry(1, 96, 48)
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: new THREE.Color(BRIGHTNESS, BRIGHTNESS, BRIGHTNESS),
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.renderOrder = -2
  mesh.frustumCulled = false
  mesh.matrixAutoUpdate = false
  const placement = milkyWayBasis().multiply(new THREE.Matrix4().makeScale(MILKY_WAY_RADIUS_KM, MILKY_WAY_RADIUS_KM, MILKY_WAY_RADIUS_KM))
  mesh.matrix.copy(placement)
  scene.add(mesh)
  return {
    mesh,
    update(camera) {
      mesh.matrix.copy(placement).setPosition(camera.position)
      mesh.matrixWorldNeedsUpdate = true
    },
    dispose() {
      scene.remove(mesh)
      geometry.dispose()
      material.dispose()
    },
  }
}
