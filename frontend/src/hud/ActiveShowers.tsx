import { activeShowers, nearestPeak } from '../meteors/showers'
import { formatSimDate } from './format'
import { useAppStore, type StoreProps } from './useAppStore'

const MAX_SHOWN = 2

export function ActiveShowers({ store }: StoreProps) {
  const text = useAppStore(store, (s) => {
    if (!s.layers.meteorShowers || s.showers.length === 0) return ''
    return activeShowers(s.showers, s.simTimeMs)
      .slice(0, MAX_SHOWN)
      .map((sh) => `${sh.name} active · peak ${formatSimDate(nearestPeak(sh, s.simTimeMs)).replace(/, \d{4}$/, '')} · up to ${sh.zhr}/hr`)
      .join('\n')
  })
  if (!text) return null
  return (
    <div id="active-showers" role="status">
      {text.split('\n').map((line) => (
        <span key={line}>{line}</span>
      ))}
    </div>
  )
}
