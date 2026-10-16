import { FollowIndicator } from './FollowIndicator'
import { InfoPanel } from './InfoPanel'
import { LayerToggles } from './LayerToggles'
import { LoadingOverlay } from './LoadingOverlay'
import { NasaPanel } from './NasaPanel'
import { TimeControls } from './TimeControls'
import { TopBar } from './TopBar'
import type { StoreProps } from './useAppStore'

export function App({ store }: StoreProps) {
  return (
    <>
      <LoadingOverlay store={store} />
      <TopBar store={store} />
      <InfoPanel store={store} />
      <NasaPanel store={store} />
      <footer id="hud-bottom">
        <TimeControls store={store} />
        <LayerToggles store={store} />
      </footer>
      <FollowIndicator store={store} />
    </>
  )
}
