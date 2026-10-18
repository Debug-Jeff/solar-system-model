export function clearSelectionOnPress(el: HTMLElement): () => void {
  const clear = () => {
    const selection = window.getSelection()
    if (selection && !selection.isCollapsed) selection.removeAllRanges()
  }
  el.addEventListener('pointerdown', clear)
  return () => el.removeEventListener('pointerdown', clear)
}
