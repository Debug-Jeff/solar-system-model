import * as THREE from 'three'
import { activeShowers, streamBelt, type Shower } from '../meteors/showers'
import { createKeplerBelt } from './belts'

const STREAM_COLOR = 0x9f86ff
const QUIET = { size: 1.2, opacity: 0.35 }
const ACTIVE = { size: 2.2, opacity: 0.9 }

export interface MeteorStreams {
  points: THREE.Points[]
  update(simTimeMs: number): void
  setVisible(on: boolean): void
  dispose(): void
}

export function createMeteorStreams(scene: THREE.Scene, showers: readonly Shower[]): MeteorStreams {
  const belts = showers.map((s) => createKeplerBelt(scene, streamBelt(s), STREAM_COLOR, QUIET.size, QUIET.opacity))
  let activeKey = ''
  return {
    points: belts.map((b) => b.points),
    update(simTimeMs) {
      const active = new Set(activeShowers(showers, simTimeMs).map((s) => s.code))
      const key = [...active].sort().join(',')
      if (key !== activeKey) {
        activeKey = key
        showers.forEach((s, i) => {
          const style = active.has(s.code) ? ACTIVE : QUIET
          belts[i]!.setStyle(style.size, style.opacity)
        })
      }
      for (const belt of belts) belt.update(simTimeMs)
    },
    setVisible(on) {
      for (const belt of belts) belt.points.visible = on
    },
    dispose() {
      for (const belt of belts) belt.dispose()
    },
  }
}
