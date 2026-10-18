import { ShareButton } from './ShareButton'
import { useAppStore, type StoreProps } from './useAppStore'

export function TopBar({ store }: StoreProps) {
  const resetView = useAppStore(store, (s) => s.resetView)
  const focusName = useAppStore(store, (s) => s.bodies.find((b) => b.id === s.followId)?.name ?? null)
  return (
    <header id="hud-top">
      <div id="title">
        <button className="home-btn" title="Zoom out to the whole Solar System" onClick={resetView}>Solar System</button>
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
