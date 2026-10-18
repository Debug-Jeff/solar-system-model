import type { AppState } from '../state/store'
import { useAppStore, type StoreProps } from './useAppStore'

const TOGGLES: { layer: keyof AppState['layers']; id: string; label: string }[] = [
  { layer: 'orbits', id: 'toggle-orbits', label: 'Orbits' },
  { layer: 'labels', id: 'toggle-labels', label: 'Labels' },
  { layer: 'constellations', id: 'toggle-constellations', label: 'Constellations' },
  { layer: 'liveEarthTexture', id: 'toggle-live-texture', label: 'Live satellite Earth' },
]

export function LayerToggles({ store }: StoreProps) {
  const layers = useAppStore(store, (s) => s.layers)
  const setLayer = useAppStore(store, (s) => s.setLayer)
  return (
    <div className="control-group toggles">
      {TOGGLES.map(({ layer, id, label }) => (
        <label key={layer}>
          <input type="checkbox" id={id} checked={layers[layer]} onChange={(e) => setLayer(layer, e.target.checked)} />{' '}
          {label}
        </label>
      ))}
    </div>
  )
}
