import { useAppStore, type StoreProps } from './useAppStore'

export function LoadingOverlay({ store }: StoreProps) {
  const { active, text, error } = useAppStore(store, (s) => s.loading)
  return (
    <div id="loading" className={active || error ? '' : 'hidden'}>
      <div className="loading-inner">
        {!error && <div className="spinner" />}
        <div id="loading-text" role={error ? 'alert' : 'status'}>
          {error ?? text}
        </div>
      </div>
    </div>
  )
}
