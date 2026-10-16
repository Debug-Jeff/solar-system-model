import { afterEach, expect, test, vi } from 'vitest'
import { startApp } from './bootstrap'
import { createAppStore } from './state/store'
import type { Body } from './types/body'

afterEach(() => {
  vi.restoreAllMocks()
})

test('backend failure sets the prod error text and does not throw', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const store = createAppStore()
  const createEngine = vi.fn()
  await startApp({ store, fetchPlanets: () => Promise.reject(new Error('503')), createEngine, isDev: false })
  expect(store.getState().loading.error).toBe('Failed to load the solar system. Please try again later.')
  expect(createEngine).not.toHaveBeenCalled()
})

test('backend failure in dev points at the backend', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const store = createAppStore()
  await startApp({ store, fetchPlanets: () => Promise.reject(new Error('x')), createEngine: vi.fn(), isDev: true })
  expect(store.getState().loading.error).toBe('Failed to load — is the backend running on :8080?')
})

test('engine failure is reported the same way', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const store = createAppStore()
  const createEngine = vi.fn(() => {
    throw new Error('no webgl')
  })
  await startApp({ store, fetchPlanets: async () => [], createEngine, isDev: false })
  expect(store.getState().loading.error).toBe('Failed to load the solar system. Please try again later.')
})

test('success sets bodies then creates engine', async () => {
  const store = createAppStore()
  const bodies = [{ id: 'sun' }] as Body[]
  const createEngine = vi.fn(() => {
    expect(store.getState().bodies).toBe(bodies)
    return { dispose: () => {} }
  })
  await startApp({ store, fetchPlanets: async () => bodies, createEngine, isDev: false })
  expect(createEngine).toHaveBeenCalledWith(store)
  expect(store.getState().loading.error).toBeNull()
})

test('a missing small-bodies file still starts the engine with planets.json bodies', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const store = createAppStore()
  const bodies = [{ id: 'sun' }] as Body[]
  const createEngine = vi.fn(() => ({ dispose: () => {} }))
  await startApp({ store, fetchPlanets: async () => bodies, fetchSmallBodies: async () => null, createEngine, isDev: false })
  expect(createEngine).toHaveBeenCalled()
  expect(store.getState().bodies.map((b) => b.id)).toEqual(['sun'])
})

test('small bodies are appended and duplicates of planets.json are dropped', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const store = createAppStore()
  const el = { epochJd: 2461200.5, a: 2.5, e: 0.1, i: 5, om: 10, w: 20, ma: 30, n: 0.25 }
  const smallBodies = {
    named: [
      { id: 'vesta', name: 'Vesta', type: 'asteroid' as const, radiusKm: 261, elements: el },
      { id: 'sun', name: 'Fake Sun', type: 'asteroid' as const, radiusKm: 1, elements: el },
    ],
    neos: [{ id: 'neo-1', name: '(2026 A1)', approachMs: 1, missKm: 6.5e6, speedKmS: 5.5, diameterKm: 0.02, hazardous: true, elements: el }],
    belts: { main: { count: 0, rows: new Float64Array(0) }, kuiper: { count: 0, rows: new Float64Array(0) } },
  }
  await startApp({ store, fetchPlanets: async () => [{ id: 'sun', name: 'Sun' }] as Body[], fetchSmallBodies: async () => smallBodies, createEngine: vi.fn(() => ({ dispose: () => {} })), isDev: false })
  const ids = store.getState().bodies.map((b) => b.id)
  expect(ids).toEqual(['sun', 'vesta', 'neo-1'])
  expect(store.getState().bodies.find((b) => b.id === 'sun')!.name).toBe('Sun')
  expect(store.getState().bodies.find((b) => b.id === 'neo-1')!.neo?.hazardous).toBe(true)
  expect(warn).toHaveBeenCalled()
})
