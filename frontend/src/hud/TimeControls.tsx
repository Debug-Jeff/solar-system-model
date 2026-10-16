import { DateModal } from './DateModal'
import { formatSpeed } from './format'
import { useAppStore, type StoreProps } from './useAppStore'

export function TimeControls({ store }: StoreProps) {
  const speed = useAppStore(store, (s) => s.speed)
  const setSpeed = useAppStore(store, (s) => s.setSpeed)
  const togglePlay = useAppStore(store, (s) => s.togglePlay)
  const setDateModalOpen = useAppStore(store, (s) => s.setDateModalOpen)
  const resetView = useAppStore(store, (s) => s.resetView)

  return (
    <>
      <div className="control-group">
        <button id="btn-play" className="icon-btn" title="Play/Pause" onClick={togglePlay}>
          {speed === 0 ? '▶' : '⏸'}
        </button>
        <label className="control-label" htmlFor="speed-slider">
          Speed
        </label>
        <input
          id="speed-slider"
          type="range"
          min={-3}
          max={3}
          step={0.1}
          value={speed}
          onChange={(e) => setSpeed(parseFloat(e.target.value))}
        />
        <span id="speed-value">{formatSpeed(speed)}</span>
      </div>
      <div className="control-group">
        <button id="btn-reset-view" className="pill-btn" onClick={resetView}>
          Reset View
        </button>
        <button id="btn-jump-date" className="pill-btn" onClick={() => setDateModalOpen(true)}>
          Jump to Date
        </button>
      </div>
      <DateModal store={store} />
    </>
  )
}
