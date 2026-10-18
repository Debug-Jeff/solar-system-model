import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { createAppStore } from '../state/store'
import { LayersPanel } from './LayersPanel'

test('the Layers button opens a panel with the toggles and an orbit-colour legend', () => {
  const store = createAppStore()
  const { container } = render(<LayersPanel store={store} />)
  const button = screen.getByRole('button', { name: 'Layers' })
  expect(button.getAttribute('aria-expanded')).toBe('false')
  expect(container.querySelector('#toggle-orbits')).toBeNull()
  fireEvent.click(button)
  expect(button.getAttribute('aria-expanded')).toBe('true')
  fireEvent.click(container.querySelector('#toggle-constellations')!)
  expect(store.getState().layers.constellations).toBe(true)
  const items = screen.getAllByRole('listitem').filter((li) => li.closest('#orbit-legend'))
  expect(items.map((li) => li.textContent)).toEqual(['Planets', 'Dwarf planets', 'Moons', 'Asteroids', 'Comets', 'Spacecraft', 'Earth satellites', 'Meteor streams'])
  const swatch = (label: string) => (items.find((li) => li.textContent === label)!.querySelector('.swatch') as HTMLElement).style.background
  expect(swatch('Spacecraft')).toMatch(/74, 222, 128|#4ade80/i)
  expect(swatch('Earth satellites')).toMatch(/244, 114, 182|#f472b6/i)
})

test('Escape and an outside click close the panel', () => {
  const store = createAppStore()
  render(<LayersPanel store={store} />)
  const button = screen.getByRole('button', { name: 'Layers' })
  fireEvent.click(button)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(button.getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(button)
  fireEvent.pointerDown(document.body)
  expect(button.getAttribute('aria-expanded')).toBe('false')
})
