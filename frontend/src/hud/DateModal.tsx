import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { MAX_JUMP_YEAR, MIN_JUMP_YEAR } from '../state/store'
import { toIsoDate } from './format'
import { useAppStore, type StoreProps } from './useAppStore'

const INVALID_DATE = `Enter a date between ${MIN_JUMP_YEAR} and ${MAX_JUMP_YEAR}.`

export function DateModal({ store }: StoreProps) {
  const open = useAppStore(store, (s) => s.dateModalOpen)
  const setOpen = useAppStore(store, (s) => s.setDateModalOpen)
  const jumpToDate = useAppStore(store, (s) => s.jumpToDate)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setValue(toIsoDate(store.getState().simTimeMs))
    setError(null)
    inputRef.current?.focus()
  }, [open, store])

  function submit(): void {
    if (jumpToDate(value)) setOpen(false)
    else setError(INVALID_DATE)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') submit()
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div id="date-modal" className={open ? '' : 'hidden'}>
      <div className="date-modal-inner glass">
        <h3>Jump to Date</h3>
        <input
          id="date-input"
          ref={inputRef}
          type="date"
          aria-label="Date"
          min={`${MIN_JUMP_YEAR}-01-01`}
          max={`${MAX_JUMP_YEAR}-12-31`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {error && (
          <p className="date-error" role="alert">
            {error}
          </p>
        )}
        <div className="date-modal-actions">
          <button className="pill-btn" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button className="pill-btn" onClick={submit}>
            Go
          </button>
        </div>
      </div>
    </div>
  )
}
