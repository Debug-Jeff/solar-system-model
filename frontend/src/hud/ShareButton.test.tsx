import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { viewBridge } from '../engine/viewBridge'
import { createAppStore } from '../state/store'
import { ShareButton } from './ShareButton'

afterEach(() => vi.restoreAllMocks())

test('Share copies a link to the current object, time and view', async () => {
  const writeText = vi.fn(async (_text: string) => {})
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  const store = createAppStore(() => Date.UTC(2026, 9, 18))
  store.getState().setSimTimeMs(Date.UTC(2030, 0, 1))
  viewBridge.setReader(() => ({ bodyId: 'iss', offsetKm: [0, 0.05, 0.2] }))
  render(<ShareButton store={store} />)
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  await vi.waitFor(() => expect(writeText).toHaveBeenCalledOnce())
  const url = new URL(writeText.mock.calls[0]![0])
  expect(url.searchParams.get('o')).toBe('iss')
  expect(url.searchParams.get('t')).toBe('2030-01-01T00:00:00Z')
  expect(url.searchParams.get('v')).toBe('0,0.05,0.2')
  expect(await screen.findByText('Link copied')).toBeInTheDocument()
})

test('when the clipboard is unavailable the link is shown to copy by hand', async () => {
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
  const store = createAppStore(() => Date.UTC(2026, 9, 18))
  viewBridge.setReader(() => ({ bodyId: null, offsetKm: [1, 1, 1] }))
  render(<ShareButton store={store} />)
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  const field = (await screen.findByLabelText('Share link')) as HTMLInputElement
  expect(field.value.startsWith('http')).toBe(true)
})
