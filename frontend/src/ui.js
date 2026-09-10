const el = (id) => document.getElementById(id)

function formatNumber(n, digits = 0) {
  return n.toLocaleString(undefined, { maximumFractionDigits: digits })
}

function formatPeriod(days) {
  if (days >= 365) return `${formatNumber(days / 365.25, 2)} yr`
  return `${formatNumber(days, 2)} days`
}

function formatRotation(hours) {
  const magnitude = Math.abs(hours)
  const label = magnitude >= 48 ? `${formatNumber(magnitude / 24, 2)} days` : `${formatNumber(magnitude, 1)} hr`
  return hours < 0 ? `${label} (retrograde)` : label
}

function formatDistance(body) {
  if (body.type === 'star') return '—'
  if (body.type === 'moon') return `${formatNumber(body.distanceFromParentKm)} km`
  return `${formatNumber(body.distanceFromSunAU, 3)} AU`
}

function buildStatRow(label, value) {
  return `<div><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`
}

// planets.json uses camelCase type values (e.g. "dwarfPlanet") since
// they're also used as JS identifiers-ish tokens elsewhere; split them
// into words only for display.
function formatType(type) {
  return type.replace(/([a-z])([A-Z])/g, '$1 $2')
}

function renderInfoPanel(body) {
  el('info-name').textContent = body.name
  el('info-type').textContent = formatType(body.type)
  el('info-stats').innerHTML = [
    buildStatRow('Radius', `${formatNumber(body.radiusKm)} km`),
    buildStatRow('Distance', formatDistance(body)),
    buildStatRow('Orbital period', body.type === 'star' ? '—' : formatPeriod(body.orbitalPeriodDays)),
    buildStatRow('Rotation', formatRotation(body.rotationPeriodHours)),
    buildStatRow('Axial tilt', `${formatNumber(body.axialTiltDeg, 1)}°`),
    buildStatRow('Mean temp', `${formatNumber(body.meanTempC)}°C`),
    buildStatRow('Moons', formatNumber(body.moonCount)),
  ].join('')
  el('info-facts').innerHTML = body.facts.map((f) => `<li>${f}</li>`).join('')
  el('info-panel').classList.remove('hidden')
}

function renderNasaPanel({ title, imageUrl, caption }) {
  el('nasa-title').textContent = title
  el('nasa-image').src = imageUrl
  el('nasa-image').alt = title
  el('nasa-caption').textContent = caption || ''
  el('nasa-panel').classList.remove('hidden')
}

function formatSpeed(value) {
  const rounded = Math.round(value * 10) / 10
  return `${rounded}×`
}

export function initUI(handlers) {
  el('info-close').addEventListener('click', () => el('info-panel').classList.add('hidden'))
  el('nasa-close').addEventListener('click', () => el('nasa-panel').classList.add('hidden'))

  // Speed is the single source of truth for "is it moving" — there's no
  // separate playing flag to fall out of sync with it. 0 IS pause. The
  // play/pause button is just a shortcut that zeroes it out and, on
  // resume, restores whatever nonzero speed was last in effect (rather
  // than always snapping back to 1x).
  const slider = el('speed-slider')
  let currentSpeed = parseFloat(slider.value)
  let lastNonzeroSpeed = currentSpeed || 1

  function setSpeed(value) {
    currentSpeed = value
    if (value !== 0) lastNonzeroSpeed = value
    slider.value = String(value)
    el('speed-value').textContent = formatSpeed(value)
    el('btn-play').textContent = value === 0 ? '▶' : '⏸'
    handlers.onSpeedChange(value)
  }

  el('btn-play').addEventListener('click', () => {
    setSpeed(currentSpeed === 0 ? lastNonzeroSpeed : 0)
  })

  slider.addEventListener('input', (e) => setSpeed(parseFloat(e.target.value)))

  el('toggle-orbits').addEventListener('change', (e) => handlers.onToggleOrbits(e.target.checked))
  el('toggle-labels').addEventListener('change', (e) => handlers.onToggleLabels(e.target.checked))
  el('toggle-true-scale').addEventListener('change', (e) => handlers.onToggleTrueScale(e.target.checked))
  el('toggle-live-texture').addEventListener('change', (e) => handlers.onToggleLiveTexture(e.target.checked))

  el('btn-reset-view').addEventListener('click', () => handlers.onResetView())

  el('btn-apod').addEventListener('click', async () => {
    el('btn-apod').disabled = true
    try {
      await handlers.onShowApod()
    } finally {
      el('btn-apod').disabled = false
    }
  })

  el('btn-live-earth').addEventListener('click', async () => {
    el('btn-live-earth').disabled = true
    try {
      await handlers.onShowLiveEarth()
    } finally {
      el('btn-live-earth').disabled = false
    }
  })

  return {
    showBodyInfo: renderInfoPanel,
    showNasaPanel: renderNasaPanel,
  }
}
