import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { textures } from './textures.js'

export const INITIAL_CAMERA_POSITION = new THREE.Vector3(0, 90, 220)

export function createScene(canvas) {
  const scene = new THREE.Scene()

  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    20000
  )
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
  // Scroll-zoom dollies toward whatever the mouse is hovering over
  // instead of always toward the orbit target (the Sun) — matching the
  // "zoom to cursor" behavior of map/CAD tools rather than re-centering
  // the view on every scroll.
  controls.zoomToCursor = true

  // The Sun is the only light source — a point light at the origin casts
  // realistic day/night terminators on every planet. A faint ambient
  // term keeps night sides from going pure black (real space is that
  // dark, but it reads as a rendering bug rather than "correct").
  const sunLight = new THREE.PointLight(0xffffff, 3.2, 0, 0)
  scene.add(sunLight)
  scene.add(new THREE.AmbientLight(0x394463, 0.35))

  const starfield = new THREE.Mesh(
    new THREE.SphereGeometry(8000, 64, 64),
    new THREE.MeshBasicMaterial({ map: textures.stars, side: THREE.BackSide })
  )
  scene.add(starfield)

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  return { scene, camera, renderer, controls }
}
