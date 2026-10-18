import { expect, test, vi } from 'vitest'
import { fullscreenSupported, toggleFullscreen } from './fullscreen'

function fakeDoc(over: Record<string, unknown>): Document {
  return { documentElement: {}, ...over } as unknown as Document
}

test('enters fullscreen with the standard API or the WebKit one, and exits when already full', async () => {
  const request = vi.fn(async () => {})
  await toggleFullscreen(fakeDoc({ fullscreenElement: null, documentElement: { requestFullscreen: request } }))
  expect(request).toHaveBeenCalledOnce()
  const webkit = vi.fn()
  await toggleFullscreen(fakeDoc({ documentElement: { webkitRequestFullscreen: webkit } }))
  expect(webkit).toHaveBeenCalledOnce()
  const exit = vi.fn(async () => {})
  await toggleFullscreen(fakeDoc({ fullscreenElement: {}, exitFullscreen: exit }))
  expect(exit).toHaveBeenCalledOnce()
})

test('a refused request is caught, and support is detected', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  await expect(toggleFullscreen(fakeDoc({ documentElement: { requestFullscreen: async () => { throw new Error('denied') } } }))).resolves.toBeUndefined()
  expect(fullscreenSupported(fakeDoc({ fullscreenEnabled: true }))).toBe(true)
  expect(fullscreenSupported(fakeDoc({}))).toBe(false)
})
