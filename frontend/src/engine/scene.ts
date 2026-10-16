import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Textures } from './textures'

export const INITIAL_CAMERA_POSITION = new THREE.Vector3(0, 90, 220)

export interface SceneParts {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  dispose(): void
}

export function createScene(canvas: HTMLCanvasElement, textures: Textures): SceneParts {
  const scene = new THREE.Scene()

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 20000)
  camera.position.copy(INITIAL_CAMERA_POSITION)

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.1

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.06
  controls.minDistance = 5
  controls.maxDistance = 4000
  controls.target.set(0, 0, 0)
  controls.zoomToCursor = true

  scene.add(new THREE.PointLight(0xffffff, 3.2, 0, 0))
  scene.add(new THREE.AmbientLight(0x394463, 0.35))

  scene.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(8000, 64, 64),
      new THREE.MeshBasicMaterial({ map: textures.stars, side: THREE.BackSide })
    )
  )

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  }
  window.addEventListener('resize', onResize)

  return {
    scene,
    camera,
    renderer,
    controls,
    dispose() {
      window.removeEventListener('resize', onResize)
      controls.dispose()
      renderer.dispose()
    },
  }
}
