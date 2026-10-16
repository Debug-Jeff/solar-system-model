import type * as THREE from 'three'

export interface LiveTextureDeps {
  load(): Promise<THREE.Texture>
  apply(texture: THREE.Texture | null): void
  onFail(err: unknown): void
}

export interface LiveTextureSwitch {
  set(useLive: boolean): void
  dispose(): void
}

export function createLiveTextureSwitch({ load, apply, onFail }: LiveTextureDeps): LiveTextureSwitch {
  let request = 0
  let current: THREE.Texture | null = null

  function clear(): void {
    apply(null)
    current?.dispose()
    current = null
  }

  return {
    set(useLive) {
      const id = ++request
      if (!useLive) {
        clear()
        return
      }
      load().then(
        (tex) => {
          if (id !== request) {
            tex.dispose()
            return
          }
          const previous = current
          current = tex
          apply(tex)
          previous?.dispose()
        },
        (err: unknown) => {
          if (id === request) onFail(err)
        }
      )
    },
    dispose() {
      request++
      current?.dispose()
      current = null
    },
  }
}
