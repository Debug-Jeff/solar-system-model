import { availability } from '../ephemeris'
import { satelliteOrbit, satellitePosition, satelliteVelocity } from '../satellites/store'
import { bodyHelioKm, distanceKm, earthHelioKm } from '../spacecraft/position'
import { formatDistance, formatNumber, formatOptional, formatPeriod, formatRadius, formatRotation, formatSimDate, formatTemp, formatType } from './format'
import { useAppStore, type StoreProps } from './useAppStore'

const AU_KM = 149_597_870.7
const EARTH_RADIUS_KM = 6371

function formatOrbitPeriod(ms: number): string {
  const minutes = ms / 60_000
  return minutes < 180 ? `${minutes.toFixed(1)} min` : `${(minutes / 60).toFixed(1)} hr`
}

function formatRange(km: number): string {
  return km < 0.1 * AU_KM ? `${formatNumber(km)} km` : `${formatNumber(km / AU_KM, 3)} AU`
}

export function InfoPanel({ store }: StoreProps) {
  const body = useAppStore(store, (s) => s.bodies.find((b) => b.id === s.selectedId) ?? null)
  const select = useAppStore(store, (s) => s.select)
  const position = useAppStore(store, (s) =>
    s.selectedId ? (availability(s.selectedId, s.simTimeMs) === 'exact' ? 'Accurate' : 'Approximate') : null
  )

  const ranges = useAppStore(store, (s) => {
    const b = s.bodies.find((x) => x.id === s.selectedId)
    if (!b || b.type !== 'spacecraft') return null
    const helio = bodyHelioKm(b.parent, b.id, s.simTimeMs)
    if (!helio) return '—|—'
    return `${formatRange(Math.hypot(helio.x, helio.y, helio.z))}|${formatRange(distanceKm(helio, earthHelioKm(s.simTimeMs)))}`
  })

  const live = useAppStore(store, (s) => {
    const b = s.bodies.find((x) => x.id === s.selectedId)
    if (!b || b.type !== 'satellite') return null
    const p = satellitePosition(b.id, s.simTimeMs)
    const v = satelliteVelocity(b.id, s.simTimeMs)
    if (!p || !v) return null
    const altitude = Number((Math.hypot(p.x, p.y, p.z) - EARTH_RADIUS_KM).toPrecision(3))
    return `${formatNumber(altitude)} km|${Math.hypot(v.x, v.y, v.z).toFixed(2)} km/s`
  })

  const orbit = body?.type === 'satellite' ? satelliteOrbit(body.id) : null
  const satelliteStats: [string, string][] =
    body?.type === 'satellite'
      ? [
          ['Purpose', body.mission?.description ?? '—'],
          ['Launched', body.mission ? formatSimDate(Date.parse(`${body.mission.launched}T00:00:00Z`)) : '—'],
          ['Altitude', live?.split('|')[0] ?? '—'],
          ['Speed', live?.split('|')[1] ?? '—'],
          ['Orbital period', orbit ? formatOrbitPeriod(orbit.periodMs) : '—'],
          ['Elements', orbit ? formatSimDate(orbit.epochMs) : '—'],
          ['Status', live ? 'Tracking' : 'No orbital data for this date'],
          ['Position', live ? (position ?? '—') : '—'],
        ]
      : []

  const spacecraftStats: [string, string][] =
    body?.type === 'spacecraft'
      ? [
          ['Mission', body.mission?.description ?? '—'],
          ['Launched', body.mission ? formatSimDate(Date.parse(`${body.mission.launched}T00:00:00Z`)) : '—'],
          ['From the Sun', ranges?.split('|')[0] ?? '—'],
          ['From Earth', ranges?.split('|')[1] ?? '—'],
          ['Status', ranges && !ranges.startsWith('—') ? 'Tracking' : 'No trajectory data for this date'],
          ['Position', position ?? '—'],
        ]
      : []

  const stats: [string, string][] = body?.type === 'spacecraft' ? spacecraftStats : body?.type === 'satellite' ? satelliteStats : body
    ? [
        ['Radius', formatRadius(body.radiusKm)],
        [body.type === 'asteroid' || body.type === 'comet' ? 'Semi-major axis' : 'Distance', formatDistance(body)],
        ['Orbital period', body.type === 'star' ? '—' : formatPeriod(body.orbitalPeriodDays)],
        ['Rotation', formatRotation(body.rotationPeriodHours)],
        ['Axial tilt', formatOptional(body.axialTiltDeg, (v) => `${formatNumber(v, 1)}°`)],
        ['Mean temp', formatTemp(body.meanTempC)],
        ['Moons', formatOptional(body.moonCount, (v) => formatNumber(v))],
        ['Position', position ?? '—'],
        ...(body.neo
          ? ([
              ['Closest approach', formatSimDate(body.neo.approachMs)],
              ['Miss distance', `${formatNumber(body.neo.missKm)} km`],
              ['Speed', `${formatNumber(body.neo.speedKmS, 2)} km/s`],
              ['Hazardous', body.neo.hazardous ? 'Yes' : 'No'],
            ] as [string, string][])
          : []),
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
