import { isLive } from '../state/store'
import { localDateTime } from './format'
import { formatRate } from './rate'
import { RateArc } from './RateArc'
import { useAppStore, type StoreProps } from './useAppStore'

export function TimeBar({ store }: StoreProps) {
  const second = useAppStore(store, (s) => Math.floor(s.simTimeMs / 1000))
  const rate = useAppStore(store, (s) => s.rate)
  const paused = useAppStore(store, (s) => s.paused)
  const live = useAppStore(store, (s) => isLive(s, s.clock()))
  const actions = store.getState()
  const { date, time, zone } = localDateTime(second * 1000)

  return (
    <div className="time-bar">
      <button className={live ? 'live-badge live' : 'live-badge'} aria-label="Go live" onClick={actions.goLive}>
        LIVE
      </button>
      <button id="btn-jump-date" className="time-readout" aria-label="Jump to Date" onClick={() => actions.setDateModalOpen(true)}>
        <span className="time-date">{date}</span>
        <span className="time-clock">{time}</span>
        <span className="time-zone">{zone}</span>
      </button>
      <span className={live ? 'rate-label live' : 'rate-label'}>{formatRate(rate, paused)}</span>
      <RateArc store={store} />
      <div className="rate-controls">
        <button className="icon-btn" aria-label="Reverse" onClick={actions.reverse}>
          ⇄
        </button>
        <button className="icon-btn" aria-label="Slower" onClick={actions.slower}>
          ◀◀
        </button>
        <button id="btn-play" className="icon-btn" title="Play/Pause" onClick={actions.togglePlay}>
          {paused ? '▶' : '⏸'}
        </button>
        <button className="icon-btn" aria-label="Faster" onClick={actions.faster}>
          ▶▶
        </button>
      </div>
    </div>
  )
}
