type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void; webkitFullscreenEnabled?: boolean }
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }

export function fullscreenSupported(doc: Document = document): boolean {
  const d = doc as FsDocument
  return Boolean(d.fullscreenEnabled || d.webkitFullscreenEnabled)
}

export function isFullscreen(doc: Document = document): boolean {
  const d = doc as FsDocument
  return Boolean(d.fullscreenElement || d.webkitFullscreenElement)
}

export async function toggleFullscreen(doc: Document = document): Promise<void> {
  const d = doc as FsDocument
  const el = doc.documentElement as FsElement
  try {
    if (isFullscreen(doc)) await (d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.())
    else await (el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.())
  } catch (err) {
    console.warn('Fullscreen is not available here', err)
  }
}
