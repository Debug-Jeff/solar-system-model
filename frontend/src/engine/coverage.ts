export interface CoverageActions {
  deselect: boolean
  stopFollow: boolean
}

export function coverageActions(selectedId: string | null, followId: string | null, isHidden: (id: string) => boolean): CoverageActions {
  return {
    deselect: selectedId !== null && isHidden(selectedId),
    stopFollow: followId !== null && isHidden(followId),
  }
}
