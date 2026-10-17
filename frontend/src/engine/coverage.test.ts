import { expect, test } from 'vitest'
import { coverageActions } from './coverage'

test('losing coverage deselects and stops following that craft only', () => {
  const hidden = (id: string) => id === 'mro'
  expect(coverageActions('mro', 'mro', hidden)).toEqual({ deselect: true, stopFollow: true })
  expect(coverageActions('mars', 'mro', hidden)).toEqual({ deselect: false, stopFollow: true })
  expect(coverageActions('mro', null, hidden)).toEqual({ deselect: true, stopFollow: false })
  expect(coverageActions('mars', 'mars', hidden)).toEqual({ deselect: false, stopFollow: false })
  expect(coverageActions(null, null, hidden)).toEqual({ deselect: false, stopFollow: false })
})
