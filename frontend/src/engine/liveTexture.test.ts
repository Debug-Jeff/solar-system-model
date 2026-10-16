import * as THREE from 'three'
import { expect, test, vi } from 'vitest'
import { createLiveTextureSwitch } from './liveTexture'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function setup() {
  const requests: ReturnType<typeof deferred<THREE.Texture>>[] = []
  const load = vi.fn(() => {
    const d = deferred<THREE.Texture>()
    requests.push(d)
    return d.promise
  })
  const apply = vi.fn<(tex: THREE.Texture | null) => void>()
  const onFail = vi.fn()
  const sw = createLiveTextureSwitch({ load, apply, onFail })
  return { sw, requests, apply, onFail }
}

test('a stale failure does not switch off a newer pending request', async () => {
  const { sw, requests, apply, onFail } = setup()
  sw.set(true)
  sw.set(false)
  sw.set(true)
  requests[0]!.reject(new Error('old'))
  await Promise.resolve()
  await Promise.resolve()
  expect(onFail).not.toHaveBeenCalled()
  const tex = new THREE.Texture()
  requests[1]!.resolve(tex)
  await vi.waitFor(() => expect(apply).toHaveBeenLastCalledWith(tex))
})

test('a stale success is disposed and not applied', async () => {
  const { sw, requests, apply } = setup()
  sw.set(true)
  sw.set(false)
  const stale = new THREE.Texture()
  const dispose = vi.spyOn(stale, 'dispose')
  requests[0]!.resolve(stale)
  await vi.waitFor(() => expect(dispose).toHaveBeenCalled())
  expect(apply).not.toHaveBeenCalledWith(stale)
})

test('toggling off disposes the applied live texture and restores the original', async () => {
  const { sw, requests, apply } = setup()
  sw.set(true)
  const tex = new THREE.Texture()
  const dispose = vi.spyOn(tex, 'dispose')
  requests[0]!.resolve(tex)
  await vi.waitFor(() => expect(apply).toHaveBeenLastCalledWith(tex))
  sw.set(false)
  expect(apply).toHaveBeenLastCalledWith(null)
  expect(dispose).toHaveBeenCalled()
})

test('the latest failure reports once', async () => {
  const { sw, requests, onFail } = setup()
  sw.set(true)
  requests[0]!.reject(new Error('down'))
  await vi.waitFor(() => expect(onFail).toHaveBeenCalledTimes(1))
})
