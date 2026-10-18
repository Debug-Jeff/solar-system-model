import * as THREE from 'three'
import { expect, test } from 'vitest'
import { comaSprite, createSunGlow } from './glow'

test('the Sun glows in three additive layers, each wider than the last', () => {
  const glow = createSunGlow()
  const sprites = glow.children as THREE.Sprite[]
  expect(sprites).toHaveLength(3)
  for (const s of sprites) {
    expect(s.material.blending).toBe(THREE.AdditiveBlending)
    expect(s.material.sizeAttenuation).toBe(false)
  }
  expect(sprites[1]!.scale.x).toBeGreaterThan(sprites[0]!.scale.x)
  expect(sprites[2]!.scale.x).toBeGreaterThan(sprites[1]!.scale.x)
})

test('a comet coma is a soft additive sprite that scales with distance', () => {
  const coma = comaSprite()
  expect(coma.material.blending).toBe(THREE.AdditiveBlending)
  expect(coma.material.sizeAttenuation).toBe(true)
})
