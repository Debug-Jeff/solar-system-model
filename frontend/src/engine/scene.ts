import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { AU_KM } from './frames'

const HOME_DISTANCE_KM = 7 * AU_KM
const HOME_ELEVATION_RAD = (35 * Math.PI) / 180
export const INITIAL_CAMERA_POSITION = new THREE.Vector3(
  0,
  HOME_DISTANCE_KM * Math.sin(HOME_ELEVATION_RAD),
  HOME_DISTANCE_KM * Math.cos(HOME_ELEVATION_RAD)
)
export const DEFAULT_MIN_DISTANCE_KM = 1
export const MAX_DISTANCE_KM = 200 * AU_KM
export const CAMERA_NEAR_KM = 1e-3
export const CAMERA_FAR_KM = 1e11
const SUN_GLOW_SCALE = 0.08

export interface SceneParts {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  dispose(): void
}

function glowTexture(): THREE.Texture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    g.addColorStop(0, 'rgba(255,250,220,1)')
    g.addColorStop(0.2, 'rgba(255,210,90,0.85)')
    g.addColorStop(0.5, 'rgba(255,170,40,0.25)')
    g.addColorStop(1, 'rgba(255,150,30,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function createScene(canvas: HTMLCanvasElement): SceneParts {
  const scene = new THREE.Scene()

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, CAMERA_NEAR_KM, CAMERA_FAR_KM)
  camera.position.copy(INITIAL_CAMERA_POSITION)

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.1

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.06
  controls.minDistance = DEFAULT_MIN_DISTANCE_KM
  controls.maxDistance = MAX_DISTANCE_KM
  controls.target.set(0, 0, 0)
  controls.zoomToCursor = true

  scene.add(new THREE.PointLight(0xffffff, 3.2, 0, 0))
  scene.add(new THREE.AmbientLight(0x394463, 0.35))

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: false,
      transparent: true,
    })
  )
  glow.scale.setScalar(SUN_GLOW_SCALE)
  scene.add(glow)

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
