import * as THREE from 'three'
import { API_BASE } from '../api/client'
import { SIM_START_MS, BASE_SIM_HOURS_PER_SECOND, type AppState, type AppStore } from '../state/store'
import { createBodies } from './bodies'
import { createFollowController } from './follow'
import { createLabelManager } from './labels'
import { createLiveTextureSwitch } from './liveTexture'
import { isClick, pickBody, type ScreenPoint } from './picking'
import { orbitVisualDistance } from './scale'
import { createScene, INITIAL_CAMERA_POSITION } from './scene'
import { createSmallBodyBelt, type BeltOptions } from './smallBodies'
import { createTextures, loadLiveEarthTexture } from './textures'

const BELTS: BeltOptions[] = [
  { innerAU: 2.1, outerAU: 3.3, count: 2500, color: 0x9c9284, size: 0.35 },
  { innerAU: 30, outerAU: 50, count: 3000, color: 0x7d93ab, size: 0.45 },
]

const MS_PER_HOUR = 3_600_000

export interface EngineOptions {
  canvas: HTMLCanvasElement
  labelsLayer: HTMLElement
  store: AppStore
}

export interface EngineHandle {
  dispose(): void
}

export function createEngine({ canvas, labelsLayer, store }: EngineOptions): EngineHandle {
  const textures = createTextures({
    onProgress: (loaded, total) => store.getState().setLoading({ text: `Loading textures… ${loaded}/${total}` }),
    onDone: () => store.getState().setLoading({ active: false }),
  })
  const parts = createScene(canvas, textures)
  const { scene, camera, renderer, controls } = parts

  const bodies = createBodies(scene, store.getState().bodies, textures)
  const labels = createLabelManager(labelsLayer)
  const belts = BELTS.map((opts) => createSmallBodyBelt(scene, opts))
  belts.forEach((belt) => belt.applyScale(orbitVisualDistance))
  const follow = createFollowController(camera, controls)
  const originalEarthDayMap = bodies.earthMaterial.map
  const followTarget = new THREE.Vector3()

  function applyState(state: AppState, prev: AppState | null): void {
    if (!prev || state.simJumpSeq !== prev.simJumpSeq) {
      bodies.snapToTime((state.simTimeMs - SIM_START_MS) / MS_PER_HOUR)
    }
    if (prev && state.resetViewSeq !== prev.resetViewSeq) {
      camera.position.copy(INITIAL_CAMERA_POSITION)
      controls.target.set(0, 0, 0)
      controls.update()
    }
    if (!prev || state.followId !== prev.followId || state.followSeq !== prev.followSeq) {
      if (state.followId) follow.start()
      else follow.stop()
    }
    if (!prev || state.selectedId !== prev.selectedId) bodies.setSelectedBody(state.selectedId)
    if (!prev || state.layers.orbits !== prev.layers.orbits) bodies.setOrbitsVisible(state.layers.orbits)
    if (!prev || state.layers.labels !== prev.layers.labels) labels.setEnabled(state.layers.labels)
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

  let pointerDownAt: ScreenPoint | null = null
  const onPointerDown = (e: PointerEvent) => {
    pointerDownAt = { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = (e: PointerEvent) => {
    if (!pointerDownAt) return
    const up = { x: e.clientX, y: e.clientY }
    const down = pointerDownAt
    pointerDownAt = null
    if (!isClick(down, up)) return
    store.getState().select(pickBody(up, canvas, camera, bodies.raycastTargets))
  }
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointerup', onPointerUp)

  const timer = new THREE.Timer()
  timer.connect(document)
  let frame = 0
  let disposed = false

  function tick(timestamp: number): void {
    frame = requestAnimationFrame(tick)
    timer.update(timestamp)
    const delta = timer.getDelta()
    const state = store.getState()
    const deltaSimHours = delta * state.speed * BASE_SIM_HOURS_PER_SECOND
    state.advance(delta)

    bodies.updateFrame(deltaSimHours)
    belts.forEach((belt) => belt.updateFrame(deltaSimHours))

    const followId = store.getState().followId
    if (followId) follow.update(bodies.getBodyWorldPos(followId, followTarget))

    controls.update()
    labels.update(bodies.list, camera, renderer)
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
      timer.dispose()
      liveTexture.dispose()
      parts.dispose()
    },
  }
}
