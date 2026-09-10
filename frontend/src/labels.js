import * as THREE from 'three'

// Renders planet name labels as plain DOM elements positioned by
// projecting each body's 3D world position into 2D screen space every
// frame — far cheaper than sprite/canvas-texture text in Three.js, and
// lets the labels use ordinary CSS (see .planet-label in style.css).
export function createLabelManager(container) {
  const elements = new Map()
  const worldPos = new THREE.Vector3()
  let enabled = true

  function ensure(entry) {
    if (elements.has(entry.id)) return elements.get(entry.id)
    const el = document.createElement('div')
    el.className = 'planet-label'
    el.textContent = entry.data.name
    container.appendChild(el)
    elements.set(entry.id, el)
    return el
  }

  function update(entries, camera, renderer) {
    if (!enabled) return
    const halfWidth = renderer.domElement.clientWidth / 2
    const halfHeight = renderer.domElement.clientHeight / 2

    for (const entry of entries) {
      const el = ensure(entry)
      entry.mesh.getWorldPosition(worldPos)
      worldPos.project(camera)

      const behindCamera = worldPos.z > 1
      if (behindCamera) {
        el.style.display = 'none'
        continue
      }
      el.style.display = 'block'
      el.style.left = `${halfWidth + worldPos.x * halfWidth}px`
      el.style.top = `${halfHeight - worldPos.y * halfHeight}px`
    }
  }

  function setEnabled(value) {
    enabled = value
    container.style.display = value ? 'block' : 'none'
  }

  return { update, setEnabled }
}
