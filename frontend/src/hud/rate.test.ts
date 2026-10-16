import { expect, test } from 'vitest'
import { formatRate } from './rate'

test.each([
  [1, false, 'real rate'],
  [60, false, '1 min/s'],
  [86_400, false, '1 day/s'],
  [31_557_600, false, '1 yr/s'],
  [-3600, false, '−1 hr/s'],
  [-1, false, '−real rate'],
  [60, true, 'PAUSED'],
  [120, false, '120×'],
])('formatRate(%d, %s) = %s', (rate, paused, label) => expect(formatRate(rate, paused)).toBe(label))
