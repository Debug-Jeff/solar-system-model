import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { createAppStore } from '../state/store'
import type { Body } from '../types/body'
import { Search } from './Search'

const b = (id: string, name: string, type: Body['type']): Body => ({ id, name, type, radiusKm: 1, orbitalPeriodDays: 1, rotationPeriodHours: 1, axialTiltDeg: 0, meanTempC: 0, moonCount: 0, facts: [] })

function setup() {
  const store = createAppStore()
  store.getState().setBodies([b('mars', 'Mars', 'planet'), b('mro', 'Mars Reconnaissance Orbiter', 'spacecraft'), b('io', 'Io', 'moon')])
  render(<Search store={store} />)
  return { store, input: screen.getByLabelText('Search') as HTMLInputElement }
}

test('arrow keys move through results and Enter selects', () => {
  const { store, input } = setup()
  fireEvent.change(input, { target: { value: 'mar' } })
  expect(screen.getAllByRole('option')).toHaveLength(2)
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(store.getState().selectedId).toBe('mro')
  expect(input.value).toBe('')
  expect(screen.queryAllByRole('option')).toHaveLength(0)
})

test('clicking a result selects it, and Escape closes the list', () => {
  const { store, input } = setup()
  fireEvent.change(input, { target: { value: 'io' } })
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(screen.queryAllByRole('option')).toHaveLength(0)
  fireEvent.change(input, { target: { value: 'io' } })
  fireEvent.mouseDown(screen.getByRole('option', { name: /Io/ }))
  expect(store.getState().selectedId).toBe('io')
})

test('"/" focuses the search box unless you are typing elsewhere', () => {
  const { input } = setup()
  fireEvent.keyDown(document.body, { key: '/' })
  expect(document.activeElement).toBe(input)
})

test('the highlighted result is announced through aria-activedescendant', () => {
  const { input } = setup()
  fireEvent.change(input, { target: { value: 'mar' } })
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  const id = input.getAttribute('aria-activedescendant')!
  expect(document.getElementById(id)?.textContent).toMatch(/Mars Reconnaissance Orbiter/)
  expect(input.getAttribute('aria-autocomplete')).toBe('list')
})
