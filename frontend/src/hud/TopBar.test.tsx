import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import type { ApodResponse, EpicItem } from '../api/client'
import { createAppStore } from '../state/store'
import { TopBar } from './TopBar'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}


async function openMenu(item: string): Promise<HTMLElement> {
  const existing = screen.queryByRole('menuitem', { name: item })
  if (existing) return existing
  fireEvent.click(screen.getByRole('button', { name: /Menu/ }))
  return screen.getByRole('menuitem', { name: item })
}

test('APOD button disables while loading and re-enables with an error on failure', async () => {
  const store = createAppStore()
  const pending = deferred<ApodResponse>()
  const loaders = { fetchApod: vi.fn(() => pending.promise), fetchLatestEpic: vi.fn<() => Promise<EpicItem>>() }
  render(<TopBar store={store} loaders={loaders} />)
  const button = (await openMenu('Picture of the Day'))
  await userEvent.click(button)
  expect(button).toBeDisabled()
  pending.reject(new Error('503'))
  expect(await screen.findByText('Could not load — try again.')).toBeInTheDocument()
  expect(button).toBeEnabled()
})

test('each button stays disabled until its own request settles', async () => {
  const store = createAppStore()
  const apod = deferred<ApodResponse>()
  const epic = deferred<EpicItem>()
  const loaders = { fetchApod: vi.fn(() => apod.promise), fetchLatestEpic: vi.fn(() => epic.promise) }
  render(<TopBar store={store} loaders={loaders} />)
  const apodButton = (await openMenu('Picture of the Day'))
  const epicButton = (await openMenu('Live Earth Photo'))
  await userEvent.click(apodButton)
  await userEvent.click(epicButton)
  expect(apodButton).toBeDisabled()
  expect(epicButton).toBeDisabled()
  apod.resolve({ title: 'a', url: '/a.jpg', explanation: '' })
  await screen.findByRole('menuitem', { name: 'Picture of the Day' })
  await waitFor(() => expect(apodButton).toBeEnabled())
  expect(epicButton).toBeDisabled()
  epic.resolve({ date: '2026-10-15 00:00:00', caption: '', imageUrl: '/e.png' })
  await waitFor(() => expect(epicButton).toBeEnabled())
})

test('APOD success opens the NASA panel', async () => {
  const store = createAppStore()
  const loaders = {
    fetchApod: vi.fn(async () => ({ title: 'Nebula', date: '2026-10-16', url: '/a.jpg', explanation: 'gas' })),
    fetchLatestEpic: vi.fn<() => Promise<EpicItem>>(),
  }
  render(<TopBar store={store} loaders={loaders} />)
  await userEvent.click((await openMenu('Picture of the Day')))
  expect(store.getState().nasaPanel).toEqual({ title: 'Nebula — 2026-10-16', imageUrl: '/a.jpg', caption: 'gas' })
})

test('Live Earth success opens the NASA panel with the EPIC date', async () => {
  const store = createAppStore()
  const loaders = {
    fetchApod: vi.fn<() => Promise<ApodResponse>>(),
    fetchLatestEpic: vi.fn(async () => ({ date: '2026-10-15 01:02:03', caption: 'earth', imageUrl: '/e.png' })),
  }
  render(<TopBar store={store} loaders={loaders} />)
  await userEvent.click((await openMenu('Live Earth Photo')))
  expect(store.getState().nasaPanel?.title).toBe('Live Earth — DSCOVR EPIC (2026-10-15)')
})
