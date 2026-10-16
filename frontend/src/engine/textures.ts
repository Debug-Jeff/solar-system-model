import * as THREE from 'three'

export interface Textures {
  stars: THREE.Texture
  sun: THREE.Texture
  mercury: THREE.Texture
  venus: { surface: THREE.Texture; atmosphere: THREE.Texture }
  earth: {
    day: THREE.Texture
    night: THREE.Texture
    clouds: THREE.Texture
    normal: THREE.Texture
    specular: THREE.Texture
  }
  moon: { map: THREE.Texture; bump: THREE.Texture }
  mars: THREE.Texture
  jupiter: THREE.Texture
  saturn: { map: THREE.Texture; ring: THREE.Texture }
  uranus: { map: THREE.Texture; ring: THREE.Texture }
  neptune: THREE.Texture
}

export interface TextureLoadingCallbacks {
  onProgress(loaded: number, total: number): void
  onDone(): void
}

export function createTextures({ onProgress, onDone }: TextureLoadingCallbacks): Textures {
  const manager = new THREE.LoadingManager()
  manager.onProgress = (_url, loaded, total) => onProgress(loaded, total)
  manager.onLoad = onDone
  manager.onError = (url) => console.warn(`Texture failed to load: ${url}`)
  const loader = new THREE.TextureLoader(manager)

  const color = (path: string) => {
    const tex = loader.load(path)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }
  const data = (path: string) => loader.load(path)

  return {
    stars: color('/textures/stars/stars.jpg'),
    sun: color('/textures/sun/sun.jpg'),
    mercury: color('/textures/mercury/mercury.jpg'),
    venus: {
      surface: color('/textures/venus/venus_surface.jpg'),
      atmosphere: color('/textures/venus/venus_atmosphere.jpg'),
    },
    earth: {
      day: color('/textures/earth/day.jpg'),
      night: color('/textures/earth/night.jpg'),
      clouds: data('/textures/earth/clouds.jpg'),
      normal: data('/textures/earth/normal.jpg'),
      specular: data('/textures/earth/specular.jpg'),
    },
    moon: {
      map: color('/textures/moon/moon.jpg'),
      bump: data('/textures/moon/moon_bump.jpg'),
    },
    mars: color('/textures/mars/mars.jpg'),
    jupiter: color('/textures/jupiter/jupiter.jpg'),
    saturn: {
      map: color('/textures/saturn/saturn.jpg'),
      ring: color('/textures/saturn/saturn_ring.png'),
    },
    uranus: {
      map: color('/textures/uranus/uranus.jpg'),
      ring: color('/textures/uranus/uranus_ring.png'),
    },
    neptune: color('/textures/neptune/neptune.jpg'),
  }
}

export function loadLiveEarthTexture(apiBase: string): Promise<THREE.Texture> {
  return new THREE.TextureLoader().loadAsync(apiBase + '/api/gibs/earth-texture').then((tex) => {
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  })
}
