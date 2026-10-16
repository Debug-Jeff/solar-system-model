import { useAppStore, type StoreProps } from './useAppStore'

export function FollowIndicator({ store }: StoreProps) {
  const name = useAppStore(store, (s) => s.bodies.find((b) => b.id === s.followId)?.name ?? null)
  const stopFollow = useAppStore(store, (s) => s.stopFollow)
  return (
    <div id="follow-indicator" className={name ? '' : 'hidden'}>
      <span id="follow-label">{name ? `Tracking ${name}` : ''}</span>
      <button id="follow-stop" aria-label="Stop tracking" onClick={stopFollow}>
        ×
      </button>
    </div>
  )
}
