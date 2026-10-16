import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test } from 'vitest'
import { createAppStore, type AppStore } from '../state/store'
import { DateModal } from './DateModal'
import { localDateTime } from './format'
import { TimeBar } from './TimeBar'

const NOW = Date.UTC(2026, 9, 16, 12, 34, 56)
let store: AppStore

beforeEach(() => {
  store = createAppStore(() => NOW)
  render(
    <>
      <TimeBar store={store} />
      <DateModal store={store} />
    </>
  )
})

test('LIVE badge is lit at start and the rate reads real rate', () => {
  expect(screen.getByRole('button', { name: 'Go live' })).toHaveClass('live')
  expect(screen.getByText('real rate')).toBeInTheDocument()
})

test('faster leaves LIVE; clicking LIVE comes back', async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Faster' }))
  expect(screen.getByText('1 min/s')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Go live' })).not.toHaveClass('live')
  await userEvent.click(screen.getByRole('button', { name: 'Go live' }))
  expect(screen.getByText('real rate')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Go live' })).toHaveClass('live')
})

test('slower, reverse and pause drive the store', async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Faster' }))
  await userEvent.click(screen.getByRole('button', { name: 'Faster' }))
  await userEvent.click(screen.getByRole('button', { name: 'Slower' }))
  expect(store.getState().rate).toBe(60)
  await userEvent.click(screen.getByRole('button', { name: 'Reverse' }))
  expect(store.getState().rate).toBe(-60)
  expect(screen.getByText('−1 min/s')).toBeInTheDocument()
  await userEvent.click(screen.getByTitle('Play/Pause'))
  expect(screen.getByText('PAUSED')).toBeInTheDocument()
})

test('shows local date, time and zone for the sim time', () => {
  const expected = localDateTime(NOW)
  expect(screen.getByText(expected.date)).toBeInTheDocument()
  expect(screen.getByText(expected.time)).toBeInTheDocument()
  expect(expected.time).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  expect(screen.getByText(expected.zone)).toBeInTheDocument()
})

test('invalid date keeps modal open with message', async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Jump to Date' }))
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '1800-01-01' } })
  await userEvent.click(screen.getByRole('button', { name: 'Go' }))
  expect(screen.getByText('Enter a date between 1900 and 2050.')).toBeInTheDocument()
  expect(store.getState().dateModalOpen).toBe(true)
})

test('valid date jumps (UTC midnight) and closes modal', async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Jump to Date' }))
  const input = screen.getByLabelText('Date')
  fireEvent.change(input, { target: { value: '2030-01-02' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(store.getState().simTimeMs).toBe(Date.UTC(2030, 0, 2))
  expect(store.getState().dateModalOpen).toBe(false)
})

test('Escape closes the date modal without jumping', async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Jump to Date' }))
  fireEvent.keyDown(screen.getByLabelText('Date'), { key: 'Escape' })
  expect(store.getState().dateModalOpen).toBe(false)
  expect(store.getState().simTimeMs).toBe(NOW)
})
