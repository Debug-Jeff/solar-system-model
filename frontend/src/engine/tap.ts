export interface PointerSample {
  pointerId: number
  x: number
  y: number
}

export interface TapDetector {
  down(e: PointerSample): void
  up(e: PointerSample): boolean
  cancel(pointerId: number): void
}

export function createTapDetector(thresholdPx = 5): TapDetector {
  const active = new Map<number, PointerSample>()
  let multiTouch = false

  function release(pointerId: number): void {
    active.delete(pointerId)
    if (active.size === 0) multiTouch = false
  }

  return {
    down(e) {
      active.set(e.pointerId, e)
      if (active.size > 1) multiTouch = true
    },
    up(e) {
      const start = active.get(e.pointerId)
      const wasMulti = multiTouch
      release(e.pointerId)
      if (!start || wasMulti) return false
      return Math.hypot(e.x - start.x, e.y - start.y) <= thresholdPx
    },
    cancel(pointerId) {
      if (active.has(pointerId)) multiTouch = true
      release(pointerId)
    },
  }
}
