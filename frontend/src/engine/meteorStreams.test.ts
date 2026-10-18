import * as THREE from 'three'
import { expect, test } from 'vitest'
import file from '../../public/data/meteor-showers.json'
import { parseShowersFile } from '../meteors/showers'
import { createMeteorStreams } from './meteorStreams'

const showers = parseShowersFile(file)
const size = (p: THREE.Points) => (p.material as THREE.ShaderMaterial).uniforms.uSize!.value as number

test('one stream per shower; active ones grow, quiet ones stay small', () => {
  const scene = new THREE.Scene()
  const streams = createMeteorStreams(scene, showers)
  expect(streams.points).toHaveLength(12)
  streams.update(Date.parse('2026-10-20T00:00:00Z'))
  const byCode = new Map(showers.map((s, i) => [s.code, streams.points[i]!]))
  expect(size(byCode.get('ORI')!)).toBeGreaterThan(size(byCode.get('PER')!))
  streams.update(Date.parse('2026-08-12T00:00:00Z'))
  expect(size(byCode.get('PER')!)).toBeGreaterThan(size(byCode.get('ORI')!))
})

test('streams hide with the layer and leave the scene on dispose', () => {
  const scene = new THREE.Scene()
  const streams = createMeteorStreams(scene, showers)
  streams.setVisible(false)
  expect(streams.points.every((p) => !p.visible)).toBe(true)
  streams.dispose()
  expect(streams.points.some((p) => scene.children.includes(p))).toBe(false)
})
