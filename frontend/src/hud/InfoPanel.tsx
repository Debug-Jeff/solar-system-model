import { availability } from '../ephemeris'
import { formatDistance, formatNumber, formatPeriod, formatRotation, formatType } from './format'
import { useAppStore, type StoreProps } from './useAppStore'

export function InfoPanel({ store }: StoreProps) {
  const body = useAppStore(store, (s) => s.bodies.find((b) => b.id === s.selectedId) ?? null)
  const select = useAppStore(store, (s) => s.select)
  const position = useAppStore(store, (s) =>
    s.selectedId ? (availability(s.selectedId, s.simTimeMs) === 'exact' ? 'Live' : 'Approximate') : null
  )

  const stats: [string, string][] = body
    ? [
        ['Radius', `${formatNumber(body.radiusKm)} km`],
        ['Distance', formatDistance(body)],
        ['Orbital period', body.type === 'star' ? '—' : formatPeriod(body.orbitalPeriodDays)],
        ['Rotation', formatRotation(body.rotationPeriodHours)],
        ['Axial tilt', `${formatNumber(body.axialTiltDeg, 1)}°`],
        ['Mean temp', `${formatNumber(body.meanTempC)}°C`],
        ['Moons', formatNumber(body.moonCount)],
        ['Position', position ?? '—'],
      ]
    : []

  return (
    <aside id="info-panel" className={body ? '' : 'hidden'}>
      <button id="info-close" aria-label="Close" onClick={() => select(null)}>
        ×
      </button>
      {body && (
        <>
          <h2 id="info-name">{body.name}</h2>
          <div id="info-type">{formatType(body.type)}</div>
          <div className="info-stats" id="info-stats">
            {stats.map(([label, value]) => (
              <div key={label}>
                <span className="stat-label">{label}</span>
                <span className="stat-value">{value}</span>
              </div>
            ))}
          </div>
          <ul id="info-facts">
            {body.facts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        </>
      )}
    </aside>
  )
}
