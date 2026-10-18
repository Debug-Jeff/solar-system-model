import { expect, test } from 'vitest'
import { detectQuality, QUALITY, type QualityEnv } from './quality'

const env = (patch: Partial<QualityEnv>): QualityEnv => ({ search: '', coarsePointer: false, screenMin: 1080, deviceMemory: 8, hardwareConcurrency: 8, ...patch })

test('tiers follow the device', () => {
  expect(detectQuality(env({ coarsePointer: true, screenMin: 390, deviceMemory: 2, hardwareConcurrency: 8 }))).toBe('low')
  expect(detectQuality(env({ coarsePointer: true, screenMin: 390, deviceMemory: 6, hardwareConcurrency: 4 }))).toBe('low')
  expect(detectQuality(env({ coarsePointer: true, screenMin: 412, deviceMemory: 6, hardwareConcurrency: 8 }))).toBe('medium')
  expect(detectQuality(env({}))).toBe('high')
  expect(detectQuality(env({ deviceMemory: undefined }))).toBe('high')
  expect(detectQuality(env({ hardwareConcurrency: 4 }))).toBe('medium')
  expect(detectQuality(env({ deviceMemory: 4 }))).toBe('medium')
  expect(detectQuality(env({ coarsePointer: true, screenMin: 1024 }))).toBe('high')
})

test('?quality= overrides detection, and junk is ignored', () => {
  expect(detectQuality(env({ search: '?quality=low' }))).toBe('low')
  expect(detectQuality(env({ coarsePointer: true, screenMin: 390, deviceMemory: 2, search: '?x=1&quality=high' }))).toBe('high')
  expect(detectQuality(env({ search: '?quality=ultra' }))).toBe('high')
})

test('each tier sets pixel ratio, antialiasing and texture size', () => {
  expect(QUALITY.low).toEqual({ pixelRatioCap: 1, antialias: false, texture: 'low' })
  expect(QUALITY.medium).toEqual({ pixelRatioCap: 1.5, antialias: true, texture: 'medium' })
  expect(QUALITY.high).toEqual({ pixelRatioCap: 2, antialias: true, texture: 'high' })
})
