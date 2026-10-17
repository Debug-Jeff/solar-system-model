import * as THREE from 'three'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createMarkerLayer, cullMarkers, MARKER_PRIORITY, moonVisible, type MarkerEntry } from './markers'

const rect = (id: string, x: number, priority: number, selected = false) => ({ id, x, y: 100, w: 60, h: 18, priority, selected })

test('overlapping markers keep the higher priority', () => {
  expect([...cullMarkers([rect('moon', 100, 1), rect('jupiter', 110, 4)])]).toEqual(['jupiter'])
})

test('the selected marker always wins an overlap', () => {
  expect([...cullMarkers([rect('jupiter', 110, 4), rect('io', 100, 1, true)])]).toEqual(['io'])
})

test('non-overlapping markers are all kept', () => {
  expect(cullMarkers([rect('a', 0, 1), rect('b', 200, 1), rect('c', 400, 1)]).size).toBe(3)
})

test('priorities follow the plan', () => {
  expect(MARKER_PRIORITY).toEqual({ star: 5, planet: 4, dwarfPlanet: 3, comet: 2, asteroid: 2, spacecraft: 2, moon: 1 })
})

test('moons appear once their orbit spans 24 px', () => {
  expect(moonVisible(23.9)).toBe(false)
  expect(moonVisible(24)).toBe(true)
})

let container: HTMLDivElement
let camera: THREE.PerspectiveCamera

beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  camera = new THREE.PerspectiveCamera(45, 2, 1, 1e12)
  camera.position.set(0, 0, 1e6)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
})

afterEach(() => container.remove())

const entry = (patch: Partial<MarkerEntry>): MarkerEntry => ({
  id: 'mars',
  name: 'Mars',
  type: 'planet',
  color: '#c1440e',
  worldKm: new THREE.Vector3(0, 0, 0),
  radiusKm: 3390,
  parentId: null,
  orbitRadiusKm: 0,
  ...patch,
})

test('a body in front gets a visible, clickable marker', () => {
  const onSelect = vi.fn()
  const layer = createMarkerLayer(container, onSelect)
  layer.update([entry({})], camera, 800, 400, null)
  const button = container.querySelector<HTMLButtonElement>('button[aria-label="Mars"]')!
  expect(button.style.display).not.toBe('none')
  button.click()
  expect(onSelect).toHaveBeenCalledWith('mars')
})

test('a body behind the camera is hidden', () => {
  const layer = createMarkerLayer(container, () => {})
  layer.update([entry({ worldKm: new THREE.Vector3(0, 0, 2e6) })], camera, 800, 400, null)
  expect(container.querySelector<HTMLButtonElement>('button[aria-label="Mars"]')!.style.display).toBe('none')
})

test('a moon whose orbit is tiny on screen is hidden unless selected', () => {
  const layer = createMarkerLayer(container, () => {})
  const io = entry({ id: 'io', name: 'Io', type: 'moon', parentId: 'jupiter', orbitRadiusKm: 10, worldKm: new THREE.Vector3(5e5, 0, 0) })
  layer.update([io], camera, 800, 400, null)
  expect(container.querySelector<HTMLButtonElement>('button[aria-label="Io"]')!.style.display).toBe('none')
  layer.update([io], camera, 800, 400, 'io')
  expect(container.querySelector<HTMLButtonElement>('button[aria-label="Io"]')!.style.display).not.toBe('none')
})

test('a body big on screen hides its ring but keeps the label', () => {
  const layer = createMarkerLayer(container, () => {})
  layer.update([entry({ radiusKm: 2e5 })], camera, 800, 400, null)
  expect(container.querySelector('button[aria-label="Mars"]')!.classList.contains('ring-hidden')).toBe(true)
})

test('names render as text', () => {
  const layer = createMarkerLayer(container, () => {})
  layer.update([entry({ name: '<b>x</b>' })], camera, 800, 400, null)
  expect(container.querySelector('b')).toBeNull()
  expect(container.textContent).toContain('<b>x</b>')
})

test('setEnabled(false) hides the layer', () => {
  const layer = createMarkerLayer(container, () => {})
  layer.setEnabled(false)
  expect(container.style.display).toBe('none')
})

test('markers never start browser gestures and a ring-hidden marker lets input through', () => {
  const layer = createMarkerLayer(container, () => {})
  layer.update([entry({ radiusKm: 2e5 }), entry({ id: 'x', name: 'Far', worldKm: new THREE.Vector3(3e5, 0, 0), radiusKm: 1 })], camera, 800, 400, null)
  const big = container.querySelector<HTMLButtonElement>('button[aria-label="Mars"]')!
  const small = container.querySelector<HTMLButtonElement>('button[aria-label="Far"]')!
  expect(big.style.touchAction).toBe('none')
  expect(big.style.pointerEvents).toBe('none')
  expect(small.style.pointerEvents).toBe('')
})

test('a hidden entry gets no marker', () => {
  const layer = createMarkerLayer(container, () => {})
  layer.update([entry({ hidden: true })], camera, 800, 400, null)
  expect(container.querySelector<HTMLButtonElement>('button[aria-label="Mars"]')!.style.display).toBe('none')
})
