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
