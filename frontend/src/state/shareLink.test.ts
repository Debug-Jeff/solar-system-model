import { expect, test } from 'vitest'
import { encodeShareLink, parseShareLink } from './shareLink'
import { MAX_SIM_MS, MIN_SIM_MS } from './store'

const known = new Set(['iss', 'mars', 'sun'])
const base = 'https://example.test/'

test('a view round-trips through the link', () => {
  const url = encodeShareLink({ bodyId: 'iss', simTimeMs: Date.UTC(2026, 9, 18, 10, 30, 12, 345), offsetKm: [0.1234567, -2, 300000.4] }, base)
  expect(url).toBe('https://example.test/?o=iss&t=2026-10-18T10%3A30%3A12Z&v=0.1235%2C-2%2C300000')
  expect(parseShareLink(new URL(url).search, known)).toEqual({ bodyId: 'iss', simTimeMs: Date.UTC(2026, 9, 18, 10, 30, 12), offsetKm: [0.1235, -2, 300000] })
})

test('a live view carries no time, and a view with nothing in it carries nothing', () => {
  expect(encodeShareLink({ bodyId: 'mars', simTimeMs: null, offsetKm: null }, base)).toBe('https://example.test/?o=mars')
  expect(encodeShareLink({ bodyId: null, simTimeMs: null, offsetKm: null }, base)).toBe('https://example.test/')
})

test('untrusted input is dropped field by field, never thrown', () => {
  expect(parseShareLink('', known)).toBeNull()
  expect(parseShareLink('?o=pluto9', known)).toBeNull()
  expect(parseShareLink('?o=%3Cimg%20src%3Dx%3E', known)).toBeNull()
  expect(parseShareLink('?o=iss&v=1,2', known)).toEqual({ bodyId: 'iss', simTimeMs: null, offsetKm: null })
  expect(parseShareLink('?o=iss&v=1,NaN,3', known)?.offsetKm).toBeNull()
  expect(parseShareLink('?o=iss&v=1e11,0,0', known)?.offsetKm).toBeNull()
  expect(parseShareLink('?o=iss&v=0,0,0', known)?.offsetKm).toBeNull()
  expect(parseShareLink('?o=iss&t=yesterday', known)).toEqual({ bodyId: 'iss', simTimeMs: null, offsetKm: null })
  expect(parseShareLink('?v=1,2,3', known)).toBeNull()
  expect(parseShareLink('?o=iss&x=' + 'a'.repeat(600), known)).toBeNull()
})

test('times outside the supported range are clamped', () => {
  expect(parseShareLink('?t=1850-01-01T00:00:00Z', known)?.simTimeMs).toBe(MIN_SIM_MS)
  expect(parseShareLink('?t=2300-01-01T00:00:00Z', known)?.simTimeMs).toBe(MAX_SIM_MS)
})

test('times must be strict ISO UTC, and offsets must have three real numbers', () => {
  expect(parseShareLink('?o=iss&t=2020', new Set(['iss']))?.simTimeMs).toBeNull()
  expect(parseShareLink('?o=iss&t=2020-01-01T00:00:00', new Set(['iss']))?.simTimeMs).toBeNull()
  expect(parseShareLink('?o=iss&v=1,,3', new Set(['iss']))?.offsetKm).toBeNull()
  expect(parseShareLink('?o=iss&v=1, ,3', new Set(['iss']))?.offsetKm).toBeNull()
})
