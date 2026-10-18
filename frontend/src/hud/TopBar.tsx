import { ShareButton } from './ShareButton'
import { useAppStore, type StoreProps } from './useAppStore'

export function TopBar({ store }: StoreProps) {
  const focusName = useAppStore(store, (s) => s.bodies.find((b) => b.id === s.followId)?.name ?? null)
  return (
    <header id="hud-top">
      <div id="title">
        <span>Solar System</span>
        {focusName && (
          <span className="breadcrumb">
            <span aria-hidden="true">›</span> {focusName}
          </span>
        )}
      </div>
      <div id="top-actions">
        <ShareButton store={store} />
      </div>
    </header>
  )
}
