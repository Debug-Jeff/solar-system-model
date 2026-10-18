import { useEffect, useMemo, useRef, useState } from 'react'
import { formatType } from './format'
import { searchBodies } from './searchBodies'
import { useAppStore, type StoreProps } from './useAppStore'

export function Search({ store }: StoreProps) {
  const bodies = useAppStore(store, (s) => s.bodies)
  const select = useAppStore(store, (s) => s.select)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const results = useMemo(() => searchBodies(bodies, query), [bodies, query])
  const shown = open ? results : []

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (e.key !== '/' || target?.closest('input, textarea, select')) return
      e.preventDefault()
      input.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function choose(id: string): void {
    select(id)
    setQuery('')
    setOpen(false)
    input.current?.blur()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, shown.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && shown[active]) {
      choose(shown[active].id)
    } else if (e.key === 'Escape') {
      setQuery('')
      setOpen(false)
      input.current?.blur()
    }
  }

  return (
    <div id="search">
      <input
        ref={input}
        type="search"
        aria-label="Search"
        placeholder="Search planets, moons, spacecraft…"
        autoComplete="off"
        role="combobox"
        aria-expanded={shown.length > 0}
        aria-controls="search-results"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      />
      {shown.length > 0 && (
        <ul id="search-results" role="listbox">
          {shown.map((body, i) => (
            <li
              key={body.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault()
                choose(body.id)
              }}
            >
              <span className="search-name">{body.name}</span>
              <span className="search-type">{formatType(body.type)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
