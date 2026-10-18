export type Offset = [number, number, number]

export interface CurrentView {
  bodyId: string | null
  offsetKm: Offset
}

export interface ViewBridge {
  read(): CurrentView | null
  setReader(reader: () => CurrentView): void
  setPending(view: { bodyId: string; offsetKm: Offset }): void
  takePending(bodyId: string): Offset | null
}

export function createViewBridge(): ViewBridge {
  let reader: (() => CurrentView) | null = null
  let pending: { bodyId: string; offsetKm: Offset } | null = null
  return {
    read: () => (reader ? reader() : null),
    setReader(next) {
      reader = next
    },
    setPending(view) {
      pending = view
    },
    takePending(bodyId) {
      if (!pending || pending.bodyId !== bodyId) return null
      const { offsetKm } = pending
      pending = null
      return offsetKm
    },
  }
}

export const viewBridge = createViewBridge()
