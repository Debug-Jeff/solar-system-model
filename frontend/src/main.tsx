import { inject as injectAnalytics } from '@vercel/analytics'
import { injectSpeedInsights } from '@vercel/speed-insights'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { fetchPlanets } from './api/client'
import { startApp } from './bootstrap'
import { createEngine } from './engine/engine'
import { loadSmallBodies } from './ephemeris/smallBodies'
import { App } from './hud/App'
import './hud/style.css'
import { createAppStore } from './state/store'

function requireElement<T extends HTMLElement>(id: string, type: new () => T): T {
  const el = document.getElementById(id)
  if (!(el instanceof type)) throw new Error(`missing #${id}`)
  return el
}

injectSpeedInsights()
injectAnalytics()

const store = createAppStore()
const canvas = requireElement('scene', HTMLCanvasElement)
const labelsLayer = requireElement('labels-layer', HTMLDivElement)

createRoot(requireElement('hud-root', HTMLDivElement)).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>
)

void startApp({
  store,
  fetchPlanets,
  fetchSmallBodies: () => loadSmallBodies(),
  createEngine: (s, small) => createEngine({ canvas, labelsLayer, store: s, smallBodies: small }),
  isDev: import.meta.env.DEV,
  shareSearch: window.location.search,
})
