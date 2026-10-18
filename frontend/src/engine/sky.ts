import * as THREE from 'three'
import { bvToRgb, raDecToScene, starAlpha, starSizePx, type SkyData } from '../sky/sky'

export const SKY_RADIUS_KM = 1e10
const LINE_COLOR = 0x5c7aa8
const LINE_OPACITY = 0.35

const vertexShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 aColor;
attribute float aSize;
attribute float aAlpha;
uniform float uPixelRatio;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPixelRatio;
  #include <logdepthbuf_vertex>
}
`

const fragmentShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec3 vColor;
varying float vAlpha;
void main() {
  #include <logdepthbuf_fragment>
  vec2 d = gl_PointCoord - 0.5;
  float r2 = dot(d, d) * 4.0;
  if (r2 > 1.0) discard;
  gl_FragColor = vec4(vColor * vAlpha * exp(-3.0 * r2), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export interface Sky {
  points: THREE.Points
  lines: THREE.LineSegments
  setConstellations(on: boolean): void
  update(camera: THREE.Camera): void
  dispose(): void
}

export function createSky(scene: THREE.Scene, data: SkyData, dprCap = 2): Sky {
  const { count, stars } = data
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  const alphas = new Float32Array(count)
  const v = new THREE.Vector3()
  const c = new THREE.Color()
  for (let i = 0; i < count; i++) {
    raDecToScene(stars[i * 4]!, stars[i * 4 + 1]!, v).multiplyScalar(SKY_RADIUS_KM)
    positions.set([v.x, v.y, v.z], i * 3)
    c.setRGB(...bvToRgb(stars[i * 4 + 3]!), THREE.SRGBColorSpace)
    colors.set([c.r, c.g, c.b], i * 3)
    sizes[i] = starSizePx(stars[i * 4 + 2]!)
    alphas[i] = starAlpha(stars[i * 4 + 2]!)
  }
  const starGeometry = new THREE.BufferGeometry()
  starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  starGeometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
  starGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  starGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1))
  const starMaterial = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: { uPixelRatio: { value: Math.min(globalThis.devicePixelRatio || 1, dprCap) } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(starGeometry, starMaterial)
  points.frustumCulled = false
  points.renderOrder = -1

  const segments: number[] = []
  for (const pairs of data.constellations.values()) {
    for (const index of pairs) segments.push(positions[index * 3]!, positions[index * 3 + 1]!, positions[index * 3 + 2]!)
  }
  const lineGeometry = new THREE.BufferGeometry()
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segments), 3))
  const lineMaterial = new THREE.LineBasicMaterial({ color: LINE_COLOR, transparent: true, opacity: LINE_OPACITY, depthWrite: false })
  const lines = new THREE.LineSegments(lineGeometry, lineMaterial)
  lines.frustumCulled = false
  lines.renderOrder = -1
  lines.visible = false

  scene.add(points, lines)
  return {
    points,
    lines,
    setConstellations(on) {
      lines.visible = on
    },
    update(camera) {
      points.position.copy(camera.position)
      lines.position.copy(camera.position)
    },
    dispose() {
      scene.remove(points, lines)
      starGeometry.dispose()
      starMaterial.dispose()
      lineGeometry.dispose()
      lineMaterial.dispose()
    },
  }
}
