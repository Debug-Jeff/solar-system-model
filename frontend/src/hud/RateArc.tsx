import { useRef } from 'react'
import { RATE_STEPS } from '../state/store'
import { formatRate } from './rate'
import { useAppStore, type StoreProps } from './useAppStore'

const POSITIONS = [...[...RATE_STEPS].reverse().map((r) => -r), ...RATE_STEPS]
const P0 = { x: 20, y: 14 }
const P1 = { x: 200, y: 62 }
const P2 = { x: 380, y: 14 }

function pointAt(t: number): { x: number; y: number } {
  const u = 1 - t
  return { x: u * u * P0.x + 2 * u * t * P1.x + t * t * P2.x, y: u * u * P0.y + 2 * u * t * P1.y + t * t * P2.y }
}

function indexOf(rate: number): number {
  const i = POSITIONS.indexOf(rate)
  return i === -1 ? POSITIONS.indexOf(1) : i
}

export function RateArc({ store }: StoreProps) {
  const rate = useAppStore(store, (s) => s.rate)
  const paused = useAppStore(store, (s) => s.paused)
  const setRate = useAppStore(store, (s) => s.setRate)
  const svg = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)
  const index = indexOf(rate)
  const dot = pointAt(index / (POSITIONS.length - 1))

  function setIndex(i: number): void {
    const clamped = Math.min(POSITIONS.length - 1, Math.max(0, i))
    setRate(POSITIONS[clamped]!)
  }

  function fromPointer(clientX: number): void {
    const box = svg.current?.getBoundingClientRect()
    if (!box || box.width === 0) return
    const x = ((clientX - box.left) / box.width) * 400
    const t = Math.min(1, Math.max(0, (x - P0.x) / (P2.x - P0.x)))
    setIndex(Math.round(t * (POSITIONS.length - 1)))
  }

  function onKeyDown(e: React.KeyboardEvent): void {
    const moves: Record<string, number> = { ArrowRight: index + 1, ArrowUp: index + 1, ArrowLeft: index - 1, ArrowDown: index - 1, Home: 0, End: POSITIONS.length - 1 }
    const next = moves[e.key]
    if (next === undefined) return
    e.preventDefault()
    setIndex(next)
  }

  return (
    <svg
      ref={svg}
      className="rate-arc"
      viewBox="0 0 400 70"
      role="slider"
      tabIndex={0}
      aria-label="Time rate"
      aria-valuemin={0}
      aria-valuemax={POSITIONS.length - 1}
      aria-valuenow={index}
      aria-valuetext={formatRate(rate, false)}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        dragging.current = true
        e.currentTarget.setPointerCapture?.(e.pointerId)
        fromPointer(e.clientX)
      }}
      onPointerMove={(e) => dragging.current && fromPointer(e.clientX)}
      onPointerUp={() => {
        dragging.current = false
      }}
    >
      <path className="rate-arc-track" d={`M ${P0.x} ${P0.y} Q ${P1.x} ${P1.y} ${P2.x} ${P2.y}`} />
      <circle className={paused ? 'rate-arc-dot paused' : 'rate-arc-dot'} cx={dot.x} cy={dot.y} r={9} />
    </svg>
  )
}
