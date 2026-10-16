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

function span(className, text) {
  const node = document.createElement('span')
  node.className = className
  node.textContent = text
  return node
}

function buildStatRow(label, value) {
  const row = document.createElement('div')
  row.append(span('stat-label', label), span('stat-value', value))
  return row
}

function buildFact(text) {
  const item = document.createElement('li')
  item.textContent = text
  return item
}

function formatType(type) {
  return type.replace(/([a-z])([A-Z])/g, '$1 $2')
}

function renderInfoPanel(body) {
  el('info-name').textContent = body.name
  el('info-type').textContent = formatType(body.type)
  el('info-stats').replaceChildren(
    buildStatRow('Radius', `${formatNumber(body.radiusKm)} km`),
    buildStatRow('Distance', formatDistance(body)),
    buildStatRow('Orbital period', body.type === 'star' ? '—' : formatPeriod(body.orbitalPeriodDays)),
    buildStatRow('Rotation', formatRotation(body.rotationPeriodHours)),
    buildStatRow('Axial tilt', `${formatNumber(body.axialTiltDeg, 1)}°`),
    buildStatRow('Mean temp', `${formatNumber(body.meanTempC)}°C`),
    buildStatRow('Moons', formatNumber(body.moonCount))
  )
  el('info-facts').replaceChildren(...body.facts.map(buildFact))
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

  // Follow mode: clicking a planet locks the camera onto it. The
  // indicator pill at the top shows which body is being tracked and
  // offers a quick stop button.
  el('follow-stop').addEventListener('click', () => {
    el('follow-indicator').classList.add('hidden')
    handlers.onStopFollow()
  })

  // Date jump modal: lets users set the simulated date directly.
  el('btn-jump-date').addEventListener('click', () => {
    const now = new Date(handlers.getCurrentSimDate())
    el('date-input').value = now.toISOString().split('T')[0]
    el('date-modal').classList.remove('hidden')
    el('date-input').focus()
  })

  el('date-cancel').addEventListener('click', () => el('date-modal').classList.add('hidden'))
  el('date-go').addEventListener('click', () => {
    const value = el('date-input').value
    if (value) handlers.onJumpToDate(value)
    el('date-modal').classList.add('hidden')
  })

  el('date-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const value = el('date-input').value
      if (value) handlers.onJumpToDate(value)
      el('date-modal').classList.add('hidden')
    } else if (e.key === 'Escape') {
      el('date-modal').classList.add('hidden')
    }
  })

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
    showFollowIndicator(name) {
      el('follow-label').textContent = `Tracking ${name}`
      el('follow-indicator').classList.remove('hidden')
    },
    hideFollowIndicator() {
      el('follow-indicator').classList.add('hidden')
    },
    updateSimDate(dateStr) {
      el('sim-date').textContent = dateStr
    },
  }
}
