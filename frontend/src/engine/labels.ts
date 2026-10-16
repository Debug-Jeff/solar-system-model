import * as THREE from 'three'

export interface Labelled {
  id: string
  data: { name: string }
  mesh: THREE.Object3D
}

export interface LabelManager {
  update(entries: readonly Labelled[], camera: THREE.Camera, renderer: THREE.WebGLRenderer): void
  setEnabled(value: boolean): void
}

export function createLabelManager(container: HTMLElement): LabelManager {
  const elements = new Map<string, HTMLDivElement>()
  const worldPos = new THREE.Vector3()
  let enabled = true

  function ensure(entry: Labelled): HTMLDivElement {
    const existing = elements.get(entry.id)
    if (existing) return existing
    const el = document.createElement('div')
    el.className = 'planet-label'
    el.textContent = entry.data.name
    container.appendChild(el)
    elements.set(entry.id, el)
    return el
  }

  return {
    update(entries, camera, renderer) {
      if (!enabled) return
      const halfWidth = renderer.domElement.clientWidth / 2
      const halfHeight = renderer.domElement.clientHeight / 2
      for (const entry of entries) {
        const el = ensure(entry)
        entry.mesh.getWorldPosition(worldPos)
        worldPos.project(camera)
        if (worldPos.z > 1) {
          el.style.display = 'none'
          continue
        }
        el.style.display = 'block'
        el.style.left = `${halfWidth + worldPos.x * halfWidth}px`
        el.style.top = `${halfHeight - worldPos.y * halfHeight}px`
      }
    },
    setEnabled(value) {
      enabled = value
      container.style.display = value ? 'block' : 'none'
    },
  }
}
