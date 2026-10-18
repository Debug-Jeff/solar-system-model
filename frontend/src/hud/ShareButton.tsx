import { useState } from 'react'
import { viewBridge } from '../engine/viewBridge'
import { encodeShareLink } from '../state/shareLink'
import { isLive } from '../state/store'
import type { StoreProps } from './useAppStore'

export function ShareButton({ store }: StoreProps) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'manual'>('idle')
  const [link, setLink] = useState('')

  async function share(): Promise<void> {
    const state = store.getState()
    const view = viewBridge.read()
    const url = encodeShareLink(
      {
        bodyId: view?.bodyId ?? null,
        simTimeMs: isLive(state, Date.now()) ? null : state.simTimeMs,
        offsetKm: view?.offsetKm ?? null,
      },
      window.location.origin + window.location.pathname
    )
    setLink(url)
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(url)
      setStatus('copied')
      window.setTimeout(() => setStatus('idle'), 2500)
    } catch {
      setStatus('manual')
    }
  }

  return (
    <span id="share">
      <button className="pill-btn" onClick={() => void share()}>
        Share
      </button>
      {status === 'copied' && (
        <span className="share-status" role="status">
          Link copied
        </span>
      )}
      {status === 'manual' && (
        <input className="share-link" aria-label="Share link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} autoFocus />
      )}
    </span>
  )
}
