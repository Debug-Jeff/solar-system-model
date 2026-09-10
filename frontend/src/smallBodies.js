import * as THREE from 'three'

// Real belt objects at different orbital radii move at genuinely
// different speeds (Kepler's third law), so each particle gets its own
// period from its own semi-major axis rather than the whole belt
// spinning as one rigid disc — this produces the differential
// shearing real belts actually have, for free.
const AU_TO_DAYS = (au) => Math.pow(au, 1.5) * 365.25

// Real belts aren't razor-thin rings in the ecliptic; scatter is
// expressed as a fraction of each particle's own orbital radius so the
// band's apparent thickness stays proportionally sane whether it's
// rendered in visual or true scale.
const VERTICAL_FRACTION = 0.06

export function createSmallBodyBelt(scene, { innerAU, outerAU, count, color, size }) {
  const angles = new Float32Array(count)
  const radiiAU = new Float32Array(count)
  const periodDays = new Float32Array(count)
  const scatter = new Float32Array(count)
  const rUnits = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    radiiAU[i] = innerAU + Math.random() * (outerAU - innerAU)
    angles[i] = Math.random() * Math.PI * 2
    periodDays[i] = AU_TO_DAYS(radiiAU[i])
    scatter[i] = (Math.random() * 2 - 1) * VERTICAL_FRACTION
  }

  const positions = new Float32Array(count * 3)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({
    color,
    size,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  scene.add(points)

  function writePositions() {
    const posAttr = geometry.attributes.position
    for (let i = 0; i < count; i++) {
      const r = rUnits[i]
      posAttr.setXYZ(i, r * Math.cos(angles[i]), r * scatter[i], r * Math.sin(angles[i]))
    }
    posAttr.needsUpdate = true
  }

  // Called once at startup and again whenever the true/visual scale
  // toggle flips, since that changes what "distance" means in units.
  function applyScale(distanceFn) {
    for (let i = 0; i < count; i++) rUnits[i] = distanceFn(radiiAU[i])
    writePositions()
  }

  function updateFrame(deltaSimHours) {
    for (let i = 0; i < count; i++) {
      angles[i] += ((2 * Math.PI) / (periodDays[i] * 24)) * deltaSimHours
    }
    writePositions()
  }

  return { points, applyScale, updateFrame }
}
