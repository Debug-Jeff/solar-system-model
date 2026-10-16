import * as THREE from 'three'
import { API_BASE } from '../api/client'
import { loadEphemSet } from '../ephemeris/loader'
import { registerSet } from '../ephemeris/moonStore'
import { isLive, type AppState, type AppStore } from '../state/store'
import { createBodies } from './bodies'
import { flyToDistance } from './flyTo'
import { createFollowController } from './follow'
import { createLiveTextureSwitch } from './liveTexture'
import { createMarkerLayer, moonVisible } from './markers'
import { clampOutsideSphere } from './pathFix'
import { projectedRadiusPx } from './projection'
import { createScene, INITIAL_CAMERA_POSITION } from './scene'
import type { SmallBodiesData } from '../ephemeris/smallBodies'
import { createKeplerBelt } from './belts'
import { createTapDetector } from './tap'
import { createTextures, loadLiveEarthTexture } from './textures'


const SECONDS_PER_HOUR = 3600
const SURFACE_CLEARANCE = 1.1
const SUN_CENTER = new THREE.Vector3()
const _planetPos = new THREE.Vector3()

export interface EngineOptions {
  canvas: HTMLCanvasElement
  labelsLayer: HTMLElement
  store: AppStore
  smallBodies?: SmallBodiesData | null
}

export interface EngineHandle {
  dispose(): void
}

const raycaster = new THREE.Raycaster()
const ndc = new THREE.Vector2()

export function createEngine({ canvas, labelsLayer, store, smallBodies }: EngineOptions): EngineHandle {
  const textures = createTextures({
    onProgress: (loaded, total) => store.getState().setLoading({ text: `Loading textures… ${loaded}/${total}` }),
    onDone: () => store.getState().setLoading({ active: false }),
  })
  const parts = createScene(canvas, textures)
  const { scene, camera, renderer, controls, starfield } = parts

  const bodies = createBodies(scene, store.getState().bodies, textures, store.getState().simTimeMs)
  const markers = createMarkerLayer(labelsLayer, (id) => store.getState().select(id))
  const belts = smallBodies
    ? [createKeplerBelt(scene, smallBodies.belts.main, 0xd8c6a4, 2), createKeplerBelt(scene, smallBodies.belts.kuiper, 0x9fb6d4, 2)]
    : []
  const follow = createFollowController(camera, controls)
  const originalEarthDayMap = bodies.earthMaterial.map
  const followTarget = new THREE.Vector3()

  function startFollowing(id: string): void {
    const entry = bodies.byId.get(id)
    if (!entry) return
    controls.zoomToCursor = false
    follow.start(flyToDistance(entry.radiusKm), performance.now())
  }

  function stopFollowing(): void {
    follow.stop()
    controls.zoomToCursor = true
  }

  const requestedSets = new Set<string>()

  function loadMoonSystems(selectedId: string | null, viewportHeight: number): void {
    const fovY = THREE.MathUtils.degToRad(camera.fov)
    for (const system of bodies.moonSystems) {
      if (requestedSets.has(system.set)) continue
      const selected = selectedId !== null && (selectedId === system.planetId || system.memberIds.includes(selectedId))
      bodies.getBodyWorldPos(system.planetId, _planetPos)
      const px = projectedRadiusPx(system.outerOrbitKm, camera.position.distanceTo(_planetPos), fovY, viewportHeight)
      if (!selected && !moonVisible(px)) continue
      requestedSets.add(system.set)
      void loadEphemSet(system.set, { onUpdate: registerSet }).then((set) => {
        if (set && !disposed) registerSet(set)
      })
    }
  }

  function keepOutsideBodies(followId: string | null): void {
    const sun = bodies.byId.get('sun')
    if (sun) clampOutsideSphere(camera.position, SUN_CENTER, sun.radiusKm * SURFACE_CLEARANCE)
    const followed = followId ? bodies.byId.get(followId) : undefined
    if (followed) clampOutsideSphere(camera.position, followTarget, followed.radiusKm * SURFACE_CLEARANCE)
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
  const inputRoot = canvas.parentElement ?? canvas
  const onPointerDown = (e: PointerEvent) => taps.down(sample(e))
  const onPointerUp = (e: PointerEvent) => {
    if (taps.up(sample(e)) && e.target === canvas) store.getState().select(pickBody(e.clientX, e.clientY))
  }
  const onPointerCancel = (e: PointerEvent) => taps.cancel(e.pointerId)
  const forwardWheel = (e: WheelEvent) => {
    e.preventDefault()
    canvas.dispatchEvent(new WheelEvent('wheel', e))
  }
  inputRoot.addEventListener('pointerdown', onPointerDown, true)
  inputRoot.addEventListener('pointerup', onPointerUp, true)
  inputRoot.addEventListener('pointercancel', onPointerCancel, true)
  labelsLayer.addEventListener('wheel', forwardWheel, { passive: false })

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
    belts.forEach((belt) => belt.update(state.simTimeMs))

    if (state.followId) follow.update(bodies.getBodyWorldPos(state.followId, followTarget), performance.now())
    controls.update()
    keepOutsideBodies(state.followId)
    camera.updateMatrixWorld()
    starfield.position.copy(camera.position)

    const height = renderer.domElement.clientHeight
    bodies.updateView(camera, height, state.selectedId, state.layers.orbits)
    loadMoonSystems(state.selectedId, height)
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
      inputRoot.removeEventListener('pointerdown', onPointerDown, true)
      inputRoot.removeEventListener('pointerup', onPointerUp, true)
      inputRoot.removeEventListener('pointercancel', onPointerCancel, true)
      labelsLayer.removeEventListener('wheel', forwardWheel)
      document.removeEventListener('visibilitychange', onVisibility)
      timer.dispose()
      liveTexture.dispose()
      markers.dispose()
      belts.forEach((belt) => belt.dispose())
      bodies.dispose()
      parts.dispose()
    },
  }
}
