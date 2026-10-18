import * as THREE from 'three'

type Stop = [number, string]

export function radialGlowTexture(stops: Stop[], size = 256): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    for (const [at, color] of stops) g.addColorStop(at, color)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function sprite(map: THREE.Texture, scale: number, opacity: number, attenuate: boolean): THREE.Sprite {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map, opacity, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: attenuate, transparent: true, toneMapped: false })
  )
  s.scale.setScalar(scale)
  return s
}

export function createSunGlow(): THREE.Group {
  const core = radialGlowTexture([
    [0, 'rgba(255,255,245,1)'],
    [0.15, 'rgba(255,240,200,0.95)'],
    [0.4, 'rgba(255,200,110,0.45)'],
    [1, 'rgba(255,170,60,0)'],
  ])
  const halo = radialGlowTexture([
    [0, 'rgba(255,220,150,0.9)'],
    [0.3, 'rgba(255,180,90,0.35)'],
    [1, 'rgba(255,150,60,0)'],
  ])
  const group = new THREE.Group()
  group.add(sprite(core, 0.1, 1, false), sprite(halo, 0.3, 0.5, false), sprite(halo, 0.6, 0.12, false))
  return group
}

export function comaSprite(color = '#bfefff'): THREE.Sprite {
  const c = new THREE.Color(color)
  const rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`
  const map = radialGlowTexture([
    [0, `rgba(${rgb},0.9)`],
    [0.25, `rgba(${rgb},0.35)`],
    [1, `rgba(${rgb},0)`],
  ], 128)
  return sprite(map, 40, 0.7, true)
}
