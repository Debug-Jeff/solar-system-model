import * as THREE from 'three'
import { BELT_STRIDE, type BeltData } from '../ephemeris/smallBodies'
import { msToJd, type Vec3 } from '../ephemeris/types'
import { AU_KM } from './frames'

export const J2000_JD = 2451545
const NEWTON_STEPS = 15
const DEG = Math.PI / 180
const TWO_PI = Math.PI * 2

export function beltPointAU(row: readonly number[], daysSinceJ2000: number): Vec3 {
  const [a, e, i, om, w, ma, n, epochJd] = row as [number, number, number, number, number, number, number, number]
  let M = ((ma + n * (daysSinceJ2000 - (epochJd - J2000_JD))) * DEG) % TWO_PI
  if (M < 0) M += TWO_PI
  let E = e > 0.8 ? Math.PI : M + e * Math.sin(M)
  for (let k = 0; k < NEWTON_STEPS; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
  const xp = a * (Math.cos(E) - e)
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E)
  const cO = Math.cos(om * DEG)
  const sO = Math.sin(om * DEG)
  const cW = Math.cos(w * DEG)
  const sW = Math.sin(w * DEG)
  const cI = Math.cos(i * DEG)
  const sI = Math.sin(i * DEG)
  return {
    x: (cO * cW - sO * sW * cI) * xp + (-cO * sW - sO * cW * cI) * yp,
    y: (sO * cW + cO * sW * cI) * xp + (-sO * sW + cO * cW * cI) * yp,
    z: sW * sI * xp + cW * sI * yp,
  }
}

const vertexShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec4 aOrbitA;
attribute vec4 aOrbitB;
uniform float uDays;
uniform float uSize;
uniform float uAuKm;
void main() {
  float a = aOrbitA.x;
  float e = aOrbitA.y;
  float inc = radians(aOrbitA.z);
  float om = radians(aOrbitA.w);
  float w = radians(aOrbitB.x);
  float M = mod(radians(aOrbitB.y + aOrbitB.z * (uDays - aOrbitB.w)), 6.28318530718);
  float E = e > 0.8 ? 3.14159265359 : M + e * sin(M);
  for (int k = 0; k < ${NEWTON_STEPS}; k++) E -= (E - e * sin(E) - M) / (1.0 - e * cos(E));
  float xp = a * (cos(E) - e);
  float yp = a * sqrt(1.0 - e * e) * sin(E);
  float cO = cos(om); float sO = sin(om); float cW = cos(w); float sW = sin(w); float cI = cos(inc); float sI = sin(inc);
  vec3 ecl = vec3(
    (cO * cW - sO * sW * cI) * xp + (-cO * sW - sO * cW * cI) * yp,
    (sO * cW + cO * sW * cI) * xp + (-sO * sW + cO * cW * cI) * yp,
    sW * sI * xp + cW * sI * yp
  );
  vec3 scenePos = vec3(ecl.x, ecl.z, -ecl.y) * uAuKm;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(scenePos, 1.0);
  gl_PointSize = uSize;
  #include <logdepthbuf_vertex>
}
`

const fragmentShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
void main() {
  #include <logdepthbuf_fragment>
  vec2 d = gl_PointCoord - 0.5;
  if (dot(d, d) > 0.25) discard;
  gl_FragColor = vec4(uColor, 0.8);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export interface KeplerBelt {
  points: THREE.Points
  update(simTimeMs: number): void
  dispose(): void
}

export function createKeplerBelt(scene: THREE.Scene, belt: BeltData, color: number, sizePx: number): KeplerBelt {
  const orbitA = new Float32Array(belt.count * 4)
  const orbitB = new Float32Array(belt.count * 4)
  for (let k = 0; k < belt.count; k++) {
    const r = belt.rows.subarray(k * BELT_STRIDE, k * BELT_STRIDE + BELT_STRIDE)
    orbitA.set([r[0]!, r[1]!, r[2]!, r[3]!], k * 4)
    orbitB.set([r[4]!, r[5]!, r[6]!, r[7]! - J2000_JD], k * 4)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(belt.count * 3), 3))
  geometry.setAttribute('aOrbitA', new THREE.BufferAttribute(orbitA, 4))
  geometry.setAttribute('aOrbitB', new THREE.BufferAttribute(orbitB, 4))
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uDays: { value: 0 },
      uSize: { value: sizePx * Math.min(globalThis.devicePixelRatio || 1, 2) },
      uAuKm: { value: AU_KM },
      uColor: { value: new THREE.Color(color) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  scene.add(points)
  return {
    points,
    update(simTimeMs) {
      material.uniforms.uDays!.value = msToJd(simTimeMs) - J2000_JD
    },
    dispose() {
      scene.remove(points)
      geometry.dispose()
      material.dispose()
    },
  }
}
