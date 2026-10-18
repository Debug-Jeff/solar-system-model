import * as THREE from 'three'
import { loadEphemSet } from '../ephemeris/loader'
import { registerSet } from '../ephemeris/moonStore'
import { isLive, type AppState, type AppStore } from '../state/store'
import { createBodies } from './bodies'
import { flyToDistance, followMinDistance } from './flyTo'
import { createFollowController } from './follow'
import { createMarkerLayer, moonVisible } from './markers'
import { loadShowers } from '../meteors/showers'
import { createMeteorStreams, type MeteorStreams } from './meteorStreams'
import { loadSky } from '../sky/sky'
import { createMilkyWay } from './milkyWay'
import { clearSelectionOnPress } from './selection'
import { createSky, type Sky } from './sky'
import { coverageActions, isOptionalBody } from './coverage'
import { loadSatellites } from '../satellites/loader'
import { registerSatellites } from '../satellites/store'
import { clampOutsideSphere } from './pathFix'
import { projectedRadiusPx } from './projection'
import { createScene, INITIAL_CAMERA_POSITION } from './scene'
import type { SmallBodiesData } from '../ephemeris/smallBodies'
import { createKeplerBelt } from './belts'
import { createTapDetector } from './tap'
import { createModelLoader, gltfLoad } from './models'
import { viewBridge } from './viewBridge'
import { zoomCamera } from './zoom'
import { browserQualityEnv, detectQuality, QUALITY } from './quality'
import { createTextures, loadProgressive } from './textures'


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
  const quality = QUALITY[detectQuality(browserQualityEnv())]
  const textures = createTextures(quality.texture, {
    onProgress: (loaded, total) => store.getState().setLoading({ text: `Loading textures… ${loaded}/${total}` }),
    onDone: () => store.getState().setLoading({ active: false }),
  })
  const parts = createScene(canvas, quality)
  const { scene, camera, renderer, controls } = parts
  viewBridge.setReader(() => {
    const offset = camera.position.clone().sub(controls.target)
    return { bodyId: store.getState().followId, offsetKm: [offset.x, offset.y, offset.z] }
  })

  const bodies = createBodies(scene, store.getState().bodies, textures, store.getState().simTimeMs, createModelLoader(gltfLoad()))
  const markers = createMarkerLayer(labelsLayer, (id) => store.getState().select(id))
  const belts = smallBodies
    ? [createKeplerBelt(scene, smallBodies.belts.main, 0xd8c6a4, 2), createKeplerBelt(scene, smallBodies.belts.kuiper, 0x9fb6d4, 2)]
    : []
  const follow = createFollowController(camera, controls)
  const followTarget = new THREE.Vector3()

  function startFollowing(id: string): void {
    const shared = viewBridge.takePending(id)
    const entry = bodies.byId.get(id)
    if (!entry) return
    controls.zoomToCursor = false
    controls.minDistance = followMinDistance(entry.radiusKm)
    if (shared) {
      const direction = new THREE.Vector3(...shared)
      follow.start(direction.length(), performance.now(), direction)
    } else {
      follow.start(flyToDistance(entry.radiusKm), performance.now())
    }
  }

  function stopFollowing(): void {
    follow.stop()
    controls.zoomToCursor = true
    controls.minDistance = 1
  }

  const requestedSets = new Set<string>()
  let disposed = false

  function requestSet(set: string): void {
    if (requestedSets.has(set)) return
    requestedSets.add(set)
    void loadEphemSet(set, { onUpdate: registerSet }).then((loaded) => {
      if (loaded && !disposed) registerSet(loaded)
    })
  }

  requestSet('spacecraft')
  let sky: Sky | null = null
  const stopClearingSelection = clearSelectionOnPress(canvas)
  const milkyWay = createMilkyWay(scene)
  loadProgressive('milkyWay', quality.texture, (tex) => {
    if (!disposed) milkyWay.setTexture(tex)
  })
  let streams: MeteorStreams | null = null
  void loadShowers().then((showers) => {
    if (!showers || disposed) return
    store.getState().setShowers(showers)
    streams = createMeteorStreams(scene, showers)
    streams.setVisible(store.getState().layers.meteorShowers)
  })
  void loadSky().then((data) => {
    if (!data || disposed) return
    sky = createSky(scene, data)
    sky.setConstellations(store.getState().layers.constellations)
  })
  void loadSatellites({ onUpdate: registerSatellites }).then((file) => {
    if (file && !disposed) registerSatellites(file)
  })

  function loadMoonSystems(selectedId: string | null, viewportHeight: number): void {
    const fovY = THREE.MathUtils.degToRad(camera.fov)
    for (const system of bodies.moonSystems) {
      if (requestedSets.has(system.set)) continue
      const selected = selectedId !== null && (selectedId === system.planetId || system.memberIds.includes(selectedId))
      bodies.getBodyWorldPos(system.planetId, _planetPos)
      const px = projectedRadiusPx(system.outerOrbitKm, camera.position.distanceTo(_planetPos), fovY, viewportHeight)
      if (!selected && !moonVisible(px)) continue
      requestSet(system.set)
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
    if (prev && state.zoom.seq !== prev.zoom.seq) {
      zoomCamera(camera.position, controls.target, state.zoom.factor, controls.minDistance, controls.maxDistance)
      controls.update()
    }
    if (prev && state.layers.constellations !== prev.layers.constellations) sky?.setConstellations(state.layers.constellations)
    if (prev && state.layers.meteorShowers !== prev.layers.meteorShowers) streams?.setVisible(state.layers.meteorShowers)
  }


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
  function tick(timestamp: number): void {
    frame = requestAnimationFrame(tick)
    timer.update(timestamp)
    const delta = timer.getDelta()
    store.getState().advance(delta)
    const state = store.getState()
    const deltaSimHours = state.paused ? 0 : (delta * state.rate) / SECONDS_PER_HOUR

    bodies.updateFrame(state.simTimeMs, deltaSimHours)
    belts.forEach((belt) => belt.update(state.simTimeMs))
    streams?.update(state.simTimeMs)

    if (state.followId) follow.update(bodies.getBodyWorldPos(state.followId, followTarget), performance.now())
    controls.update()
    keepOutsideBodies(state.followId)
    camera.updateMatrixWorld()
    sky?.update(camera)
    milkyWay.update(camera)

    const height = renderer.domElement.clientHeight
    bodies.updateView(camera, height, state.selectedId, state.layers.orbits)
    loadMoonSystems(state.selectedId, height)
    const lost = coverageActions(state.selectedId, state.followId, (id) => {
      const entry = bodies.byId.get(id)
      return entry !== undefined && isOptionalBody(entry.type) && !entry.pivot.visible
    })
    if (lost.deselect) state.select(null)
    if (lost.stopFollow) state.stopFollow()
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
      markers.dispose()
      belts.forEach((belt) => belt.dispose())
      bodies.dispose()
      sky?.dispose()
      milkyWay.dispose()
      stopClearingSelection()
      streams?.dispose()
      parts.dispose()
    },
  }
}
