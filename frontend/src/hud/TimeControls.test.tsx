import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { createAppStore } from '../state/store'
import { DateModal } from './DateModal'
import { TimeControls } from './TimeControls'

test('play button toggles pause and label', async () => {
  const store = createAppStore()
  render(
    <>
      <TimeControls store={store} />
      <DateModal store={store} />
    </>
  )
  const play = screen.getByTitle('Play/Pause')
  expect(play).toHaveTextContent('⏸')
  await userEvent.click(play)
  expect(store.getState().speed).toBe(0)
  expect(play).toHaveTextContent('▶')
  await userEvent.click(play)
  expect(store.getState().speed).toBe(1)
  expect(play).toHaveTextContent('⏸')
})

test('invalid date keeps modal open with message', async () => {
  const store = createAppStore()
  render(
    <>
      <TimeControls store={store} />
      <DateModal store={store} />
    </>
  )
  await userEvent.click(screen.getByRole('button', { name: 'Jump to Date' }))
  const input = screen.getByLabelText('Date')
  fireEvent.change(input, { target: { value: '1800-01-01' } })
  await userEvent.click(screen.getByRole('button', { name: 'Go' }))
  expect(screen.getByText('Enter a date between 1900 and 2050.')).toBeInTheDocument()
  expect(store.getState().dateModalOpen).toBe(true)
})

test('valid date jumps and closes modal', async () => {
  const store = createAppStore()
  render(
    <>
      <TimeControls store={store} />
      <DateModal store={store} />
    </>
  )
  await userEvent.click(screen.getByRole('button', { name: 'Jump to Date' }))
  const input = screen.getByLabelText('Date')
  fireEvent.change(input, { target: { value: '2030-01-02' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(store.getState().simTimeMs).toBe(Date.UTC(2030, 0, 2))
  expect(store.getState().dateModalOpen).toBe(false)
})

test('Escape closes the date modal without jumping', async () => {
  const store = createAppStore()
  render(
    <>
      <TimeControls store={store} />
      <DateModal store={store} />
    </>
  )
  await userEvent.click(screen.getByRole('button', { name: 'Jump to Date' }))
  fireEvent.keyDown(screen.getByLabelText('Date'), { key: 'Escape' })
  expect(store.getState().dateModalOpen).toBe(false)
  expect(store.getState().simJumpSeq).toBe(0)
})
