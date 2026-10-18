import { LayersPanel } from './LayersPanel'
import { useAppStore, type StoreProps } from './useAppStore'

const ZOOM_STEP = 0.5

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function RightRail({ store, children }: StoreProps & { children?: React.ReactNode }) {
  const zoomBy = useAppStore(store, (s) => s.zoomBy)
  const resetView = useAppStore(store, (s) => s.resetView)
  const toggleInfo = useAppStore(store, (s) => s.toggleInfo)
  const infoCollapsed = useAppStore(store, (s) => s.infoCollapsed)

  function fullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen?.()
    else void document.documentElement.requestFullscreen?.().catch(() => {})
  }

  return (
    <nav id="right-rail" aria-label="View controls">
      <button className="rail-btn" aria-label="Info" aria-pressed={!infoCollapsed} onClick={toggleInfo}>
        <Icon d="M12 8h.01M11 12h1v5h1M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" />
      </button>
      <LayersPanel store={store}>{children}</LayersPanel>
      <button className="rail-btn" aria-label="Zoom in" onClick={() => zoomBy(ZOOM_STEP)}>
        <Icon d="M12 5v14M5 12h14" />
      </button>
      <button className="rail-btn" aria-label="Zoom out" onClick={() => zoomBy(1 / ZOOM_STEP)}>
        <Icon d="M5 12h14" />
      </button>
      <button id="btn-reset-view" className="rail-btn" aria-label="Reset view" onClick={resetView}>
        <Icon d="M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4" />
      </button>
      <button className="rail-btn" aria-label="Fullscreen" onClick={fullscreen}>
        <Icon d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
      </button>
    </nav>
  )
}
