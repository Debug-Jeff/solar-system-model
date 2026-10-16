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

const BELTS = [
  { innerAU: 2.1, outerAU: 3.3, count: 2500, color: 0x9c9284, size: 0.35 },
  { innerAU: 30, outerAU: 50, count: 3000, color: 0x7d93ab, size: 0.45 },
]

const BASE_SIM_HOURS_PER_SECOND = 24

const SIM_START_DATE = new Date('2026-10-16T00:00:00Z')

function formatDate(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const m = months[date.getUTCMonth()]
  const d = date.getUTCDate()
  const y = date.getUTCFullYear()
  return `${m} ${d}, ${y}`
}

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
  const timer = new THREE.Timer()
  timer.connect(document)
  const raycaster = new THREE.Raycaster()
  const pointerNDC = new THREE.Vector2()
  let pointerDownAt = null

  // --- Simulated date ---
  let simElapsedHours = 0

  function getCurrentSimDate() {
    return new Date(SIM_START_DATE.getTime() + simElapsedHours * 3600 * 1000)
  }

  function jumpToDate(dateStr) {
    const target = new Date(dateStr + 'T00:00:00Z')
    simElapsedHours = (target.getTime() - SIM_START_DATE.getTime()) / (3600 * 1000)
    bodies.snapToTime(simElapsedHours)
    ui.updateSimDate(formatDate(getCurrentSimDate()))
  }

  // --- Camera follow ---
  let followBodyId = null
  const _followTargetPos = new THREE.Vector3()
  const _followCamPos = new THREE.Vector3()
  const _desiredTarget = new THREE.Vector3()
  const _desiredCamPos = new THREE.Vector3()
  const _offsetDir = new THREE.Vector3()
  let followInitialized = false
  const FOLLOW_SMOOTHNESS = 0.08
  const FOLLOW_CAM_DISTANCE = 18
  const FOLLOW_CAM_HEIGHT = 10

  function startFollow(bodyId) {
    followBodyId = bodyId
    followInitialized = false
    const entry = bodies.byId.get(bodyId)
    if (entry) ui.showFollowIndicator(entry.data.name)
  }

  function stopFollow() {
    followBodyId = null
    followInitialized = false
    ui.hideFollowIndicator()
  }

  function updateFollow() {
    if (!followBodyId) return
    bodies.getBodyWorldPos(followBodyId, _followTargetPos)

    _desiredTarget.copy(_followTargetPos)

    if (!followInitialized) {
      // On the first frame, compute an offset based on current camera
      // direction so the transition isn't jarring — place the camera
      // behind the body from the direction it's already looking.
      _offsetDir.copy(camera.position).sub(controls.target).normalize()
      _desiredCamPos.copy(_followTargetPos).add(
        _offsetDir.multiplyScalar(FOLLOW_CAM_DISTANCE)
      )
      camera.position.copy(_desiredCamPos)
      controls.target.copy(_desiredTarget)
      followInitialized = true
      return
    }

    // Smoothly move camera and target toward the body's current position.
    // The camera maintains its relative offset to the body, so it
    // appears to follow the body through space while still letting the
    // user orbit/zoom with the mouse.
    const currentOffset = _offsetDir.copy(camera.position).sub(controls.target)
    _desiredCamPos.copy(_followTargetPos).add(currentOffset)

    camera.position.lerp(_desiredCamPos, FOLLOW_SMOOTHNESS)
    controls.target.lerp(_desiredTarget, FOLLOW_SMOOTHNESS)
  }

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
      stopFollow()
      camera.position.copy(INITIAL_CAMERA_POSITION)
      controls.target.set(0, 0, 0)
      controls.update()
    },
    onStopFollow: () => stopFollow(),
    getCurrentSimDate: () => getCurrentSimDate(),
    onJumpToDate: (dateStr) => jumpToDate(dateStr),
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
      startFollow(entry.id)
    } else {
      bodies.setSelectedBody(null)
    }
  })

  let lastDateUpdate = 0
  function tick(timestamp) {
    requestAnimationFrame(tick)
    timer.update(timestamp)
    const delta = timer.getDelta()
    const deltaSimHours = delta * state.speed * BASE_SIM_HOURS_PER_SECOND
    simElapsedHours += deltaSimHours

    bodies.updateFrame(deltaSimHours)
    belts.forEach((belt) => belt.updateFrame(deltaSimHours))

    updateFollow()

    controls.update()
    labels.update(bodies.list, camera, renderer)

    // Update the date display ~4x/sec rather than every frame.
    lastDateUpdate += delta
    if (lastDateUpdate > 0.25) {
      lastDateUpdate = 0
      ui.updateSimDate(formatDate(getCurrentSimDate()))
    }

    renderer.render(scene, camera)
  }
  tick()
}

injectSpeedInsights()

main().catch((err) => {
  console.error('Failed to start solar system:', err)
  document.getElementById('loading-text').textContent = import.meta.env.DEV
    ? 'Failed to load — is the backend running on :8080?'
    : 'Failed to load the solar system. Please try again later.'
})
