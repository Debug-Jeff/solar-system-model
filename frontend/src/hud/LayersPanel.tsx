import { useEffect, useRef, useState } from 'react'
import { ASTEROID_ORBIT_COLOR, COMET_ORBIT_COLOR, METEOR_STREAM_COLOR, SATELLITE_ORBIT_COLOR, SPACECRAFT_ORBIT_COLOR } from '../engine/orbitStyle'
import { LayerToggles } from './LayerToggles'
import type { StoreProps } from './useAppStore'

const LEGEND: { label: string; swatch: string }[] = [
  { label: 'Planets', swatch: 'linear-gradient(90deg, #b5a7a7, #e3bb76, #6b93d6, #c1440e, #d8ca9d, #ead6b8, #4b70dd)' },
  { label: 'Dwarf planets', swatch: '#d9cfc4' },
  { label: 'Moons', swatch: '#9aa7bd' },
  { label: 'Asteroids', swatch: ASTEROID_ORBIT_COLOR },
  { label: 'Comets', swatch: COMET_ORBIT_COLOR },
  { label: 'Spacecraft', swatch: SPACECRAFT_ORBIT_COLOR },
  { label: 'Earth satellites', swatch: SATELLITE_ORBIT_COLOR },
  { label: 'Meteor streams', swatch: METEOR_STREAM_COLOR },
]

export function LayersPanel({ store, children }: StoreProps & { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  return (
    <div id="layers" ref={root}>
      <button className="rail-btn" aria-label="Layers" aria-expanded={open} aria-controls="layers-panel" onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M12 3 3 8l9 5 9-5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div id="layers-panel" role="dialog" aria-label="Layers">
          <LayerToggles store={store} />
          <h3>Orbit colours</h3>
          <ul id="orbit-legend">
            {LEGEND.map(({ label, swatch }) => (
              <li key={label}>
                <span className="swatch" style={{ background: swatch }} />
                {label}
              </li>
            ))}
          </ul>
          {children}
        </div>
      )}
    </div>
  )
}
