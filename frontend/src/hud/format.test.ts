import { expect, test } from 'vitest'
import { SIM_START_MS } from '../state/store'
import { formatPeriod, formatRotation, formatSimDate, formatSpeed, formatType } from './format'

test('formatPeriod years', () => expect(formatPeriod(687, 'en-US')).toBe('1.88 yr'))

test('formatPeriod days', () => expect(formatPeriod(87.97, 'en-US')).toBe('87.97 days'))

test('formatRotation retrograde days', () => expect(formatRotation(-5832.5, 'en-US')).toBe('243.02 days (retrograde)'))

test('formatRotation hours', () => expect(formatRotation(23.93, 'en-US')).toBe('23.9 hr'))

test('formatType splits camelCase', () => expect(formatType('dwarfPlanet')).toBe('dwarf Planet'))

test('formatSpeed rounds to one decimal', () => expect(formatSpeed(1.26)).toBe('1.3×'))

test('formatSimDate', () => expect(formatSimDate(SIM_START_MS)).toBe('Oct 16, 2026'))
