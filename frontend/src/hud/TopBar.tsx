import { useState } from 'react'
import { fetchApod, fetchLatestEpic, type ApodResponse, type EpicItem } from '../api/client'
import type { NasaPanelContent } from '../state/store'
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
      <div id="title">Solar System</div>
      <div id="top-actions">
        <button id="btn-apod" className="pill-btn" disabled={busy.apod} onClick={() => void load('apod')}>
          Picture of the Day
        </button>
        <button id="btn-live-earth" className="pill-btn" disabled={busy.epic} onClick={() => void load('epic')}>
          Live Earth Photo
        </button>
        {error && (
          <span className="load-error" role="status">
            {error}
          </span>
        )}
      </div>
    </header>
  )
}
