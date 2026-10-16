import * as THREE from 'three'
import { API_BASE } from '../api/client'
import { isLive, type AppState, type AppStore } from '../state/store'
import { createBodies } from './bodies'
import { flyToDistance } from './flyTo'
import { createFollowController } from './follow'
import { AU_KM } from './frames'
import { createLiveTextureSwitch } from './liveTexture'
import { createMarkerLayer } from './markers'
import { createScene, DEFAULT_MIN_DISTANCE_KM, INITIAL_CAMERA_POSITION } from './scene'
import { createSmallBodyBelt, type BeltOptions } from './smallBodies'
import { createTapDetector } from './tap'
import { createTextures, loadLiveEarthTexture } from './textures'

const BELTS: BeltOptions[] = [
  { innerAU: 2.1, outerAU: 3.3, count: 2500, color: 0x9c9284, size: 1.5 },
  { innerAU: 30, outerAU: 50, count: 3000, color: 0x7d93ab, size: 1.5 },
]

const SECONDS_PER_HOUR = 3600
const FOLLOW_MIN_DISTANCE_RADII = 1.2

export interface EngineOptions {
  canvas: HTMLCanvasElement
  labelsLayer: HTMLElement
  store: AppStore
}

export interface EngineHandle {
  dispose(): void
}

const raycaster = new THREE.Raycaster()
const ndc = new THREE.Vector2()

export function createEngine({ canvas, labelsLayer, store }: EngineOptions): EngineHandle {
  const textures = createTextures({
    onProgress: (loaded, total) => store.getState().setLoading({ text: `Loading textures… ${loaded}/${total}` }),
    onDone: () => store.getState().setLoading({ active: false }),
  })
  const parts = createScene(canvas, textures)
  const { scene, camera, renderer, controls, starfield } = parts

  const bodies = createBodies(scene, store.getState().bodies, textures, store.getState().simTimeMs)
  const markers = createMarkerLayer(labelsLayer, (id) => store.getState().select(id))
  const belts = BELTS.map((opts) => createSmallBodyBelt(scene, opts))
  belts.forEach((belt) => belt.applyScale((au) => au * AU_KM))
  const follow = createFollowController(camera, controls)
  const originalEarthDayMap = bodies.earthMaterial.map
  const followTarget = new THREE.Vector3()

  function startFollowing(id: string): void {
    const entry = bodies.byId.get(id)
    if (!entry) return
    controls.minDistance = entry.radiusKm * FOLLOW_MIN_DISTANCE_RADII
    follow.start(flyToDistance(entry.radiusKm), performance.now())
  }

  function stopFollowing(): void {
    follow.stop()
    controls.minDistance = DEFAULT_MIN_DISTANCE_KM
  }

  function applyState(state: AppState, prev: AppState | null): void {
    if (prev && state.resetViewSeq !== prev.resetViewSeq) {
      stopFollowing()
      camera.position.copy(INITIAL_CAMERA_POSITION)
      controls.target.set(0, 0, 0)
      controls.update()
    }
    if (!prev || state.followId !== prev.followId || state.followSeq !== prev.followSeq) {
      if (state.followId) startFollowing(state.followId)
      else stopFollowing()
    }
    if (!prev || state.layers.labels !== prev.layers.labels) markers.setEnabled(state.layers.labels)
    if (prev && state.layers.liveEarthTexture !== prev.layers.liveEarthTexture) {
      liveTexture.set(state.layers.liveEarthTexture)
    }
  }

  const liveTexture = createLiveTextureSwitch({
    load: () => loadLiveEarthTexture(API_BASE),
    apply: (tex) => {
      bodies.earthMaterial.map = tex ?? originalEarthDayMap
      bodies.earthMaterial.needsUpdate = true
    },
    onFail: (err) => {
      console.warn('Live Earth texture unavailable, keeping static texture.', err)
      store.getState().setLayer('liveEarthTexture', false)
    },
  })

  applyState(store.getState(), null)
  const unsubscribe = store.subscribe((state, prev) => applyState(state, prev))

  function pickBody(x: number, y: number): string | null {
    const rect = canvas.getBoundingClientRect()
    ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    const id: unknown = raycaster.intersectObjects(bodies.raycastTargets, false)[0]?.object.userData.bodyId
    return typeof id === 'string' ? id : null
  }

  const taps = createTapDetector()
  const sample = (e: PointerEvent) => ({ pointerId: e.pointerId, x: e.clientX, y: e.clientY })
  const onPointerDown = (e: PointerEvent) => taps.down(sample(e))
  const onPointerUp = (e: PointerEvent) => {
    if (taps.up(sample(e))) store.getState().select(pickBody(e.clientX, e.clientY))
  }
  const onPointerCancel = (e: PointerEvent) => taps.cancel(e.pointerId)
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerCancel)

  let wasLiveWhenHidden = false
  const onVisibility = () => {
    if (document.hidden) wasLiveWhenHidden = isLive(store.getState(), Date.now())
    else store.getState().resyncIfLive(wasLiveWhenHidden)
  }
  document.addEventListener('visibilitychange', onVisibility)

  const timer = new THREE.Timer()
  timer.connect(document)
  let frame = 0
  let disposed = false

  function tick(timestamp: number): void {
    frame = requestAnimationFrame(tick)
    timer.update(timestamp)
    const delta = timer.getDelta()
    store.getState().advance(delta)
    const state = store.getState()
    const deltaSimHours = state.paused ? 0 : (delta * state.rate) / SECONDS_PER_HOUR

    bodies.updateFrame(state.simTimeMs, deltaSimHours)
    belts.forEach((belt) => belt.updateFrame(deltaSimHours))

    if (state.followId) follow.update(bodies.getBodyWorldPos(state.followId, followTarget), performance.now())
    controls.update()
    camera.updateMatrixWorld()
    starfield.position.copy(camera.position)

    const height = renderer.domElement.clientHeight
    bodies.updateView(camera, height, state.selectedId, state.layers.orbits)
    markers.update(bodies.markerEntries, camera, renderer.domElement.clientWidth, height, state.selectedId)
    renderer.render(scene, camera)
  }
  frame = requestAnimationFrame(tick)

  return {
    dispose() {
      if (disposed) return
      disposed = true
      cancelAnimationFrame(frame)
      unsubscribe()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerCancel)
      document.removeEventListener('visibilitychange', onVisibility)
      timer.dispose()
      liveTexture.dispose()
      markers.dispose()
      parts.dispose()
    },
  }
}
