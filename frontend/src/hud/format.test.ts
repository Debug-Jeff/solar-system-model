import { expect, test } from 'vitest'
import { formatOptional, formatPeriod, formatRadius, formatRotation, formatSimDate, formatSpeed, formatType, localDateTime } from './format'

const SIM_START_MS = Date.UTC(2026, 9, 16)

test('formatPeriod years', () => expect(formatPeriod(687, 'en-US')).toBe('1.88 yr'))

test('formatPeriod days', () => expect(formatPeriod(87.97, 'en-US')).toBe('87.97 days'))

test('formatRotation retrograde days', () => expect(formatRotation(-5832.5, 'en-US')).toBe('243.02 days (retrograde)'))

test('formatRotation hours', () => expect(formatRotation(23.93, 'en-US')).toBe('23.9 hr'))

test('formatType splits camelCase', () => expect(formatType('dwarfPlanet')).toBe('dwarf Planet'))

test('formatSpeed rounds to one decimal', () => expect(formatSpeed(1.26)).toBe('1.3×'))

test('localDateTime in UTC', () => expect(localDateTime(Date.UTC(2026, 9, 16, 7, 5, 9), 'UTC')).toEqual({ date: 'Oct 16, 2026', time: '07:05:09', zone: 'UTC' }))

test('formatSimDate', () => expect(formatSimDate(SIM_START_MS)).toBe('Oct 16, 2026'))

test('formatRadius uses metres below 1 km and three significant figures', () => {
  expect(formatRadius(0.245, 'en-US')).toBe('245 m')
  expect(formatRadius(0.0081, 'en-US')).toBe('8.1 m')
  expect(formatRadius(261.4, 'en-US')).toBe('261 km')
  expect(formatRadius(6371, 'en-US')).toBe('6,371 km')
})

test('formatOptional shows a dash for unknown values', () => {
  expect(formatOptional(Number.NaN, (v) => `${v}°`)).toBe('—')
  expect(formatOptional(3.1, (v) => `${v}°`)).toBe('3.1°')
})
