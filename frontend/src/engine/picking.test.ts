import { expect, test } from 'vitest'
import { isClick } from './picking'

test('isClick true at ≤5px', () => expect(isClick({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(true))

test('isClick false for a drag over 5px', () => expect(isClick({ x: 0, y: 0 }, { x: 6, y: 0 })).toBe(false))

test('isClick honours a custom threshold', () => expect(isClick({ x: 0, y: 0 }, { x: 8, y: 0 }, 10)).toBe(true))
