import { expect, test } from 'vitest'
import { createViewBridge } from './viewBridge'

test('a pending view is handed over once, and only for its own body', () => {
  const bridge = createViewBridge()
  bridge.setPending({ bodyId: 'iss', offsetKm: [0, 0, 1] })
  expect(bridge.takePending('mars')).toBeNull()
  expect(bridge.takePending('iss')).toEqual([0, 0, 1])
  expect(bridge.takePending('iss')).toBeNull()
})

test('the current view comes from whatever reader the engine installed', () => {
  const bridge = createViewBridge()
  expect(bridge.read()).toBeNull()
  bridge.setReader(() => ({ bodyId: 'sun', offsetKm: [1, 2, 3] }))
  expect(bridge.read()).toEqual({ bodyId: 'sun', offsetKm: [1, 2, 3] })
})
