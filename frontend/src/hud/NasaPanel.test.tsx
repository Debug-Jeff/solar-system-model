import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { createAppStore } from '../state/store'
import { NasaPanel } from './NasaPanel'

test('HTML in fetched text renders as text', () => {
  const store = createAppStore()
  store.getState().showNasaPanel({ title: '<img src=x onerror=alert(1)>', imageUrl: '/x.jpg', caption: '<b>hi</b>' })
  render(<NasaPanel store={store} />)
  expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
  expect(screen.getByText('<b>hi</b>')).toBeInTheDocument()
  expect(document.querySelector('b')).toBeNull()
})

test('close button clears the panel', async () => {
  const store = createAppStore()
  store.getState().showNasaPanel({ title: 't', imageUrl: '/x.jpg', caption: 'c' })
  render(<NasaPanel store={store} />)
  await userEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(store.getState().nasaPanel).toBeNull()
})
