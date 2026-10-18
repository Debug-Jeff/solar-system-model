import { useEffect, useRef, useState } from 'react'
import { fetchApod, fetchLatestEpic, type ApodResponse, type EpicItem } from '../api/client'
import type { NasaPanelContent } from '../state/store'
import { Search } from './Search'
import { ShareButton } from './ShareButton'
import { useAppStore, type StoreProps } from './useAppStore'

export interface NasaLoaders {
  fetchApod(): Promise<ApodResponse>
  fetchLatestEpic(): Promise<EpicItem>
}

const defaultLoaders: NasaLoaders = { fetchApod, fetchLatestEpic }

type Source = 'apod' | 'epic'

const LOAD_ERROR = 'Could not load — try again.'

export function TopBar({ store, loaders = defaultLoaders }: StoreProps & { loaders?: NasaLoaders }) {
  const showNasaPanel = useAppStore(store, (s) => s.showNasaPanel)
  const selectedName = useAppStore(store, (s) => s.bodies.find((b) => b.id === s.selectedId)?.name ?? null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    const onPointer = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [menuOpen])
  const [busy, setBusy] = useState<Record<Source, boolean>>({ apod: false, epic: false })
  const [error, setError] = useState<string | null>(null)

  async function load(source: Source): Promise<void> {
    setBusy((b) => ({ ...b, [source]: true }))
    setError(null)
    try {
      let content: NasaPanelContent
      if (source === 'apod') {
        const data = await loaders.fetchApod()
        content = {
          title: data.date ? `${data.title} — ${data.date}` : data.title,
          imageUrl: data.hdurl || data.url,
          caption: data.explanation,
        }
      } else {
        const item = await loaders.fetchLatestEpic()
        content = {
          title: `Live Earth — DSCOVR EPIC (${item.date.split(' ')[0]})`,
          imageUrl: item.imageUrl,
          caption: item.caption,
        }
      }
      showNasaPanel(content)
    } catch (err) {
      console.warn(`Could not load ${source}`, err)
      setError(LOAD_ERROR)
    } finally {
      setBusy((b) => ({ ...b, [source]: false }))
    }
  }

  return (
    <header id="hud-top">
      <div id="title">
        <span>Solar System</span>
        {selectedName && (
          <span className="breadcrumb">
            <span aria-hidden="true">›</span> {selectedName}
          </span>
        )}
      </div>
      <Search store={store} />
      <div id="top-actions">
        <ShareButton store={store} />
        <div id="menu" ref={menu}>
          <button className="text-btn" aria-expanded={menuOpen} aria-controls="menu-list" onClick={() => setMenuOpen((o) => !o)}>
            <span aria-hidden="true">☰</span> Menu
          </button>
          {menuOpen && (
            <div id="menu-list" role="menu">
              <button id="btn-apod" role="menuitem" disabled={busy.apod} onClick={() => void load('apod')}>
                Picture of the Day
              </button>
              <button id="btn-live-earth" role="menuitem" disabled={busy.epic} onClick={() => void load('epic')}>
                Live Earth Photo
              </button>
              {error && (
                <span className="load-error" role="status">
                  {error}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
