import * as THREE from 'three'
import type { BodyType } from '../types/body'
import { projectedRadiusPx, projectToScreen } from './projection'

export const MARKER_PRIORITY: Record<BodyType, number> = { star: 5, planet: 4, dwarfPlanet: 3, comet: 2, asteroid: 2, spacecraft: 2, moon: 1, satellite: 0 }
const MOON_MIN_ORBIT_PX = 24
const RING_HIDE_RADIUS_PX = 8
const RING_OFFSET_PX = 11
const LABEL_HEIGHT_PX = 18
const CHAR_WIDTH_PX = 7

export interface MarkerEntry {
  id: string
  name: string
  type: BodyType
  color: string
  worldKm: THREE.Vector3
  radiusKm: number
  parentId: string | null
  orbitRadiusKm: number
  hidden?: boolean
}

export interface MarkerRect {
  id: string
  x: number
  y: number
  w: number
  h: number
  priority: number
  selected: boolean
}

export interface MarkerLayer {
  update(entries: readonly MarkerEntry[], camera: THREE.PerspectiveCamera, width: number, height: number, selectedId: string | null): void
  setEnabled(on: boolean): void
  dispose(): void
}

export function moonVisible(moonOrbitRadiusPx: number): boolean {
  return moonOrbitRadiusPx >= MOON_MIN_ORBIT_PX
}

function overlaps(a: MarkerRect, b: MarkerRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

export function cullMarkers(items: readonly MarkerRect[]): Set<string> {
  const ordered = items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        Number(b.item.selected) - Number(a.item.selected) || b.item.priority - a.item.priority || a.index - b.index
    )
  const accepted: MarkerRect[] = []
  for (const { item } of ordered) {
    if (!accepted.some((other) => overlaps(item, other))) accepted.push(item)
  }
  return new Set(accepted.map((a) => a.id))
}

interface MarkerElement {
  button: HTMLButtonElement
  ring: HTMLSpanElement
  label: HTMLSpanElement
}

export function createMarkerLayer(container: HTMLElement, onSelect: (id: string) => void): MarkerLayer {
  const elements = new Map<string, MarkerElement>()

  function ensure(entry: MarkerEntry): MarkerElement {
    const existing = elements.get(entry.id)
    if (existing) return existing
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'marker'
    button.setAttribute('aria-label', entry.name)
    const ring = document.createElement('span')
    ring.className = 'marker-ring'
    const label = document.createElement('span')
    label.className = 'marker-label'
    label.textContent = entry.name
    button.append(ring, label)
    button.style.setProperty('--marker-color', entry.color)
    button.style.touchAction = 'none'
    button.addEventListener('click', () => onSelect(entry.id))
    container.append(button)
    const created = { button, ring, label }
    elements.set(entry.id, created)
    return created
  }

  return {
    update(entries, camera, width, height, selectedId) {
      const fovY = THREE.MathUtils.degToRad(camera.fov)
      const candidates: MarkerRect[] = []
      const placed = new Map<string, { x: number; y: number; ringHidden: boolean }>()
      for (const entry of entries) {
        const el = ensure(entry)
        const selected = entry.id === selectedId
        const projection = projectToScreen(entry.worldKm, camera, width, height)
        const distance = camera.position.distanceTo(entry.worldKm)
        const tinyMoonSystem =
          (entry.type === 'moon' || entry.type === 'satellite') && !selected && !moonVisible(projectedRadiusPx(entry.orbitRadiusKm, distance, fovY, height))
        if (entry.hidden || !projection.visible || tinyMoonSystem) {
          el.button.style.display = 'none'
          continue
        }
        placed.set(entry.id, {
          x: projection.x,
          y: projection.y,
          ringHidden: projectedRadiusPx(entry.radiusKm, distance, fovY, height) >= RING_HIDE_RADIUS_PX,
        })
        candidates.push({
          id: entry.id,
          x: projection.x - RING_OFFSET_PX,
          y: projection.y - LABEL_HEIGHT_PX / 2,
          w: entry.name.length * CHAR_WIDTH_PX + 2 * RING_OFFSET_PX,
          h: LABEL_HEIGHT_PX,
          priority: MARKER_PRIORITY[entry.type],
          selected,
        })
      }
      const visible = cullMarkers(candidates)
      for (const [id, place] of placed) {
        const el = elements.get(id)
        if (!el) continue
        if (!visible.has(id)) {
          el.button.style.display = 'none'
          continue
        }
        el.button.style.display = ''
        el.button.style.transform = `translate(${place.x}px, ${place.y}px)`
        el.button.classList.toggle('ring-hidden', place.ringHidden)
        el.button.style.pointerEvents = place.ringHidden ? 'none' : ''
        el.button.classList.toggle('selected', id === selectedId)
      }
    },
    setEnabled(on) {
      container.style.display = on ? '' : 'none'
    },
    dispose() {
      for (const { button } of elements.values()) button.remove()
      elements.clear()
    },
  }
}
