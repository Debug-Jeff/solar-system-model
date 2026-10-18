import * as THREE from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import type { BodyType } from '../types/body'

export const TRAIL_SAMPLES = 64
const TRAIL_WIDTH_PX = 2
const TRAIL_TYPES: ReadonlySet<BodyType> = new Set(['satellite', 'spacecraft', 'asteroid', 'comet'])

export function isTrailType(type: BodyType): boolean {
  return TRAIL_TYPES.has(type)
}

export function trailSamples(positionAt: (utcMs: number) => THREE.Vector3 | null, nowMs: number, spanMs: number, samples = TRAIL_SAMPLES): THREE.Vector3[] {
  const head = positionAt(nowMs)
  if (!head) return []
  const points = [new THREE.Vector3()]
  for (let k = 1; k < samples; k++) {
    const p = positionAt(nowMs - (spanMs * k) / (samples - 1))
    if (!p) break
    points.push(p.sub(head))
  }
  return points
}

export interface Trail {
  line: Line2
  setPoints(points: readonly THREE.Vector3[]): void
  setResolution(width: number, height: number): void
  colors(): number[]
  dispose(): void
}

export function createTrail(): Trail {
  const geometry = new LineGeometry()
  const material = new LineMaterial({
    linewidth: TRAIL_WIDTH_PX,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    worldUnits: false,
  })
  const line = new Line2(geometry, material)
  line.frustumCulled = false
  line.visible = false
  let lastColors: number[] = []
  return {
    line,
    setPoints(points) {
      if (points.length < 2) {
        line.visible = false
        return
      }
      const positions: number[] = []
      const colors: number[] = []
      points.forEach((p, i) => {
        positions.push(p.x, p.y, p.z)
        const a = Math.pow(1 - i / (points.length - 1), 1.6)
        colors.push(a, a, a)
      })
      geometry.setPositions(positions)
      geometry.setColors(colors)
      line.computeLineDistances()
      lastColors = colors
      line.visible = true
    },
    setResolution(width, height) {
      material.resolution.set(width, height)
    },
    colors: () => lastColors,
    dispose() {
      line.removeFromParent()
      geometry.dispose()
      material.dispose()
    },
  }
}
