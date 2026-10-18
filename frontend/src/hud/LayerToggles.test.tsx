import { fireEvent, render } from '@testing-library/react'
import { expect, test } from 'vitest'
import { createAppStore } from '../state/store'
import { LayerToggles } from './LayerToggles'

test('the constellations toggle starts off and drives its layer', () => {
  const store = createAppStore()
  const { container } = render(<LayerToggles store={store} />)
  const box = container.querySelector<HTMLInputElement>('#toggle-constellations')!
  expect(box.checked).toBe(false)
  fireEvent.click(box)
  expect(store.getState().layers.constellations).toBe(true)
})
