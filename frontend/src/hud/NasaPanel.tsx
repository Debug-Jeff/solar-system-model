import { useAppStore, type StoreProps } from './useAppStore'

export function NasaPanel({ store }: StoreProps) {
  const panel = useAppStore(store, (s) => s.nasaPanel)
  const close = useAppStore(store, (s) => s.closeNasaPanel)
  return (
    <div id="nasa-panel" className={panel ? '' : 'hidden'}>
      <button id="nasa-close" aria-label="Close" onClick={close}>
        ×
      </button>
      {panel && (
        <>
          <h3 id="nasa-title">{panel.title}</h3>
          <img id="nasa-image" src={panel.imageUrl} alt={panel.title} />
          <p id="nasa-caption">{panel.caption}</p>
        </>
      )}
    </div>
  )
}
