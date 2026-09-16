import * as THREE from 'three'
import { injectSpeedInsights } from '@vercel/speed-insights'
import { createScene, INITIAL_CAMERA_POSITION } from './scene.js'
import { createBodies } from './bodies.js'
import { createSmallBodyBelt } from './smallBodies.js'
import { createLabelManager } from './labels.js'
import { initUI } from './ui.js'
import { fetchPlanets, fetchApod, fetchLatestEpic } from './api.js'
import { loadLiveEarthTexture } from './textures.js'
import { orbitVisualDistance, orbitTrueDistance } from './data/scale.js'

// Real belt boundaries: the asteroid belt sits roughly 2.1-3.3 AU
// between Mars and Jupiter; the Kuiper belt spans roughly 30-50 AU
// starting just beyond Neptune's orbit.
const BELTS = [
  { innerAU: 2.1, outerAU: 3.3, count: 2500, color: 0x9c9284, size: 0.35 },
  { innerAU: 30, outerAU: 50, count: 3000, color: 0x7d93ab, size: 0.45 },
]

// Simulated hours that pass per real second at 1x speed: one simulated
// day per real second, chosen to be slow enough to actually track a
// planet's motion by eye (the previous 6 days/sec whipped Mercury
// through 7% of its whole orbit every second). See bodies.js for how
// axial spin is deliberately decoupled from this same clock.
const BASE_SIM_HOURS_PER_SECOND = 24 // 1 simulated day/sec at 1x

async function main() {
  const canvas = document.getElementById('scene')
  const { scene, camera, renderer, controls } = createScene(canvas)

  const planetsData = await fetchPlanets()
  const bodies = createBodies(scene, planetsData, false)
  const labels = createLabelManager(document.getElementById('labels-layer'))

  const belts = BELTS.map((opts) => createSmallBodyBelt(scene, opts))
  belts.forEach((belt) => belt.applyScale(orbitVisualDistance))

  const originalEarthDayMap = bodies.earthMaterial.map

  const state = { speed: 1 }
  const clock = new THREE.Clock()
  const raycaster = new THREE.Raycaster()
  const pointerNDC = new THREE.Vector2()
  let pointerDownAt = null

  const ui = initUI({
    onSpeedChange: (speed) => {
      state.speed = speed
    },
    onToggleOrbits: (visible) => bodies.setOrbitsVisible(visible),
    onToggleLabels: (visible) => labels.setEnabled(visible),
    onToggleTrueScale: (trueScale) => {
      bodies.setTrueScale(trueScale)
      const distanceFn = trueScale ? orbitTrueDistance : orbitVisualDistance
      belts.forEach((belt) => belt.applyScale(distanceFn))
    },
    onToggleLiveTexture: async (useLive) => {
      if (useLive) {
        try {
          bodies.earthMaterial.map = await loadLiveEarthTexture()
          bodies.earthMaterial.needsUpdate = true
        } catch (err) {
          console.warn('Live Earth texture unavailable, keeping static texture.', err)
          document.getElementById('toggle-live-texture').checked = false
        }
      } else {
        bodies.earthMaterial.map = originalEarthDayMap
        bodies.earthMaterial.needsUpdate = true
      }
    },
    onResetView: () => {
      camera.position.copy(INITIAL_CAMERA_POSITION)
      controls.target.set(0, 0, 0)
      controls.update()
    },
    onShowApod: async () => {
      const data = await fetchApod()
      ui.showNasaPanel({
        title: data.date ? `${data.title} — ${data.date}` : data.title,
        imageUrl: data.hdurl || data.url,
        caption: data.explanation,
      })
    },
    onShowLiveEarth: async () => {
      const item = await fetchLatestEpic()
      ui.showNasaPanel({
        title: `Live Earth — DSCOVR EPIC (${item.date.split(' ')[0]})`,
        imageUrl: item.imageUrl,
        caption: item.caption,
      })
    },
  })

  // A drag-to-orbit gesture on the canvas shouldn't also count as a
  // planet click, so a "click" only counts when the pointer barely
  // moved between down and up.
  canvas.addEventListener('pointerdown', (e) => {
    pointerDownAt = { x: e.clientX, y: e.clientY }
  })
  canvas.addEventListener('pointerup', (e) => {
    if (!pointerDownAt) return
    const moved = Math.hypot(e.clientX - pointerDownAt.x, e.clientY - pointerDownAt.y)
    pointerDownAt = null
    if (moved > 5) return

    pointerNDC.x = (e.clientX / window.innerWidth) * 2 - 1
    pointerNDC.y = -(e.clientY / window.innerHeight) * 2 + 1
    raycaster.setFromCamera(pointerNDC, camera)
    const hits = raycaster.intersectObjects(bodies.raycastTargets, false)
    if (hits.length) {
      const entry = bodies.byId.get(hits[0].object.userData.bodyId)
      ui.showBodyInfo(entry.data)
      bodies.setSelectedBody(entry.id)
    } else {
      bodies.setSelectedBody(null)
    }
  })

  function tick() {
    requestAnimationFrame(tick)
    const delta = clock.getDelta()
    const deltaSimHours = delta * state.speed * BASE_SIM_HOURS_PER_SECOND

    bodies.updateFrame(deltaSimHours)
    belts.forEach((belt) => belt.updateFrame(deltaSimHours))
    controls.update()
    labels.update(bodies.list, camera, renderer)
    renderer.render(scene, camera)
  }
  tick()
}

injectSpeedInsights()

main().catch((err) => {
  console.error('Failed to start solar system:', err)
  document.getElementById('loading-text').textContent =
    'Failed to load — is the backend running on :8080?'
})
