import * as THREE from 'three'

const AU_TO_DAYS = (au: number) => Math.pow(au, 1.5) * 365.25
const VERTICAL_FRACTION = 0.06

export interface BeltOptions {
  innerAU: number
  outerAU: number
  count: number
  color: number
  size: number
}

export interface SmallBodyBelt {
  points: THREE.Points
  applyScale(distanceFn: (au: number) => number): void
  updateFrame(deltaSimHours: number): void
}

export function createSmallBodyBelt(scene: THREE.Scene, { innerAU, outerAU, count, color, size }: BeltOptions): SmallBodyBelt {
  const angles = new Float32Array(count)
  const radiiAU = new Float32Array(count)
  const periodDays = new Float32Array(count)
  const scatter = new Float32Array(count)
  const rUnits = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    const r = innerAU + Math.random() * (outerAU - innerAU)
    radiiAU[i] = r
    angles[i] = Math.random() * Math.PI * 2
    periodDays[i] = AU_TO_DAYS(r)
    scatter[i] = (Math.random() * 2 - 1) * VERTICAL_FRACTION
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
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
    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < count; i++) {
      const r = rUnits[i]!
      const a = angles[i]!
      posAttr.setXYZ(i, r * Math.cos(a), r * scatter[i]!, r * Math.sin(a))
    }
    posAttr.needsUpdate = true
  }

  return {
    points,
    applyScale(distanceFn) {
      for (let i = 0; i < count; i++) rUnits[i] = distanceFn(radiiAU[i]!)
      writePositions()
    },
    updateFrame(deltaSimHours) {
      for (let i = 0; i < count; i++) {
        angles[i] = angles[i]! + ((2 * Math.PI) / (periodDays[i]! * 24)) * deltaSimHours
      }
      writePositions()
    },
  }
}
