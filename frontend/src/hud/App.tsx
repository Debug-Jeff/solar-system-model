import { ActiveShowers } from './ActiveShowers'
import { CreditsLink } from './Credits'
import { DateModal } from './DateModal'
import { FollowIndicator } from './FollowIndicator'
import { InfoPanel } from './InfoPanel'
import { LayersPanel } from './LayersPanel'
import { LoadingOverlay } from './LoadingOverlay'
import { NasaPanel } from './NasaPanel'
import { TimeBar } from './TimeBar'
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
        <ActiveShowers store={store} />
        <TimeBar store={store} />
        <LayersPanel store={store}>
          <CreditsLink />
        </LayersPanel>
      </footer>
      <FollowIndicator store={store} />
      <DateModal store={store} />
    </>
  )
}
