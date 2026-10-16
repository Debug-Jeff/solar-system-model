import * as THREE from 'three'
import { API_BASE } from './api.js'

const loadingEl = document.getElementById('loading')
const loadingTextEl = document.getElementById('loading-text')

export const loadingManager = new THREE.LoadingManager()

loadingManager.onProgress = (_url, loaded, total) => {
  loadingTextEl.textContent = `Loading textures… ${loaded}/${total}`
}

loadingManager.onLoad = () => {
  loadingEl.classList.add('hidden')
}

loadingManager.onError = (url) => {
  console.warn(`Texture failed to load: ${url}`)
}

const loader = new THREE.TextureLoader(loadingManager)

function loadColorTexture(path) {
  const tex = loader.load(path)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function loadDataTexture(path) {
  return loader.load(path)
}

export const textures = {
  stars: loadColorTexture('/textures/stars/stars.jpg'),
  sun: loadColorTexture('/textures/sun/sun.jpg'),
  mercury: loadColorTexture('/textures/mercury/mercury.jpg'),
  venus: {
    surface: loadColorTexture('/textures/venus/venus_surface.jpg'),
    atmosphere: loadColorTexture('/textures/venus/venus_atmosphere.jpg'),
  },
  earth: {
    day: loadColorTexture('/textures/earth/day.jpg'),
    night: loadColorTexture('/textures/earth/night.jpg'),
    clouds: loadDataTexture('/textures/earth/clouds.jpg'),
    normal: loadDataTexture('/textures/earth/normal.jpg'),
    specular: loadDataTexture('/textures/earth/specular.jpg'),
  },
  moon: {
    map: loadColorTexture('/textures/moon/moon.jpg'),
    bump: loadDataTexture('/textures/moon/moon_bump.jpg'),
  },
  mars: loadColorTexture('/textures/mars/mars.jpg'),
  jupiter: loadColorTexture('/textures/jupiter/jupiter.jpg'),
  saturn: {
    map: loadColorTexture('/textures/saturn/saturn.jpg'),
    ring: loadColorTexture('/textures/saturn/saturn_ring.png'),
  },
  uranus: {
    map: loadColorTexture('/textures/uranus/uranus.jpg'),
    ring: loadColorTexture('/textures/uranus/uranus_ring.png'),
  },
  neptune: loadColorTexture('/textures/neptune/neptune.jpg'),
}

export function loadLiveEarthTexture() {
  return new Promise((resolve, reject) => {
    loader.load(
      API_BASE + '/api/gibs/earth-texture',
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        resolve(tex)
      },
      undefined,
      reject
    )
  })
}
