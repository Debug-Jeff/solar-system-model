import { existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, meshopt, prune, simplify, textureCompress, weld } from '@gltf-transform/functions'
import draco3d from 'draco3dgltf'
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import sharp from 'sharp'

const frontend = join(dirname(fileURLToPath(import.meta.url)), '..')
const cache = process.env.MODEL_CACHE ?? join(frontend, '..', '.texture-cache', 'models')
const out = join(frontend, 'public', 'models')
const staging = join(frontend, 'public', 'models.staging')
const BASE = 'https://raw.githubusercontent.com/nasa/NASA-3D-Resources/11ebb4ee043715aefbba6aeec8a61746fad67fa7/3D%20Models/'
const MAX_FILE_MB = 1.5
const MAX_TOTAL_MB = 12
const SMALL_BODY_BASE = 'https://assets.science.nasa.gov/content/dam/science/psd/solar/2023/09/'
const SMALL_BODY_CREDIT = 'NASA Visualization Technology Applications and Development (VTAD), science.nasa.gov 3D resources'
// Longest axis in km, so each shape model is drawn at its real size.
const SMALL_BODIES = {
  vesta: { url: SMALL_BODY_BASE + 'v/Vesta_1_100.glb', sizeKm: 572.6 },
  eros: { url: SMALL_BODY_BASE + 'e/Eros_1_10.glb', sizeKm: 34.4 },
  itokawa: { url: SMALL_BODY_BASE + 'i/Itokawa_1_1.glb', sizeKm: 0.535 },
  bennu: { url: SMALL_BODY_BASE + 'b/Bennu_1_1.glb', sizeKm: 0.565 },
  arrokoth: { url: SMALL_BODY_BASE + 'a/Arrokoth.glb', sizeKm: 36 },
}
const CREDIT = 'NASA 3D Resources (described by NASA as free and without copyright; used under NASA media usage guidelines; no endorsement implied)'

const MODELS = {
  parker: 'Parker Solar Probe/Parker Solar Probe.glb',
  'voyager-1': 'Voyager Probe (A)/Voyager Probe (A).glb',
  'voyager-2': 'Voyager Probe (A)/Voyager Probe (A).glb',
  'osiris-apex': 'Origins, Spectral Interpretation, Resource Identification, and Security - Regolith Explorer (OSIRIS-REx)/OSIRIS-REx.glb',
  jwst: 'James Webb Space Telescope (B)/James Webb Space Telescope (B).glb',
  mro: 'Mars Reconnaissance Orbiter (MRO) (C)/Mars Reconnaissance Orbiter (MRO) (C).glb',
  'juno-probe': 'Juno (B)/Juno (B).glb',
  iss: 'International Space Station (ISS) (B)/International Space Station (ISS) (B).glb',
  hubble: 'Hubble Space Telescope (A)/Hubble Space Telescope (A).glb',
  chandra: 'Chandra X-ray Observatory/Chandra X-ray Observatory.glb',
  swift: 'Swift/Swift.glb',
  aqua: 'Aqua (B)/Aqua (B).glb',
  aura: 'Aura (A)/Aura (A).glb',
  'landsat-8': 'Landsat 8/Landsat 8.glb',
  'landsat-9': 'Landsat 8/Landsat 8.glb',
  'icesat-2': 'Ice, Clouds, and Land Elevation Satellite-2 (ICESat-2) (A)/Ice, Clouds, and Land Elevation Satellite-2 (ICESat-2) (A).glb',
  'sentinel-6a': 'Jason Continuity of Service (Sentinel-6)/Jason Continuity of Service (Sentinel-6).glb',
  'suomi-npp': 'Suomi National Polar-orbiting Partnership (Suomi NPP)/Suomi National Polar-orbiting Partnership (Suomi NPP).glb',
  'goes-16': 'Geostationary Operational Environmental Satellites/Geostationary Operational Environmental Satellites.glb',
  'goes-18': 'Geostationary Operational Environmental Satellites/Geostationary Operational Environmental Satellites.glb',
  'goes-19': 'Geostationary Operational Environmental Satellites/Geostationary Operational Environmental Satellites.glb',
  'tdrs-13': 'Tracking and Data Relay Satellites (TDRS) (D)/Tracking and Data Relay Satellites (TDRS) (D).glb',
}

async function download(path) {
  mkdirSync(cache, { recursive: true })
  const file = join(cache, path.replaceAll('/', '__'))
  if (existsSync(file) && statSync(file).size > 0) return file
  const res = await fetch(path.startsWith('https://') ? path : BASE + path.split('/').map(encodeURIComponent).join('/'))
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  return file
}

await MeshoptEncoder.ready
await MeshoptSimplifier.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'draco3d.decoder': await draco3d.createDecoderModule() })
rmSync(staging, { recursive: true, force: true })
mkdirSync(staging, { recursive: true })

const manifest = { version: 1, models: {} }
const sources = [
  ...Object.entries(MODELS).map(([id, path]) => ({ id, path, source: `NASA-3D-Resources/3D Models/${path}`, credit: CREDIT })),
  ...Object.entries(SMALL_BODIES).map(([id, { url, sizeKm }]) => ({ id, path: url, source: url, credit: SMALL_BODY_CREDIT, sizeKm })),
]
const built = new Map()
let totalBytes = 0
for (const { id, path, source: origin, credit, sizeKm } of sources) {
  if (!built.has(path)) {
    const name = (path.startsWith('https://') ? path.split('/').pop().replace(/\.glb$/, '') : path.split('/')[0]).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()
    const rel = `models/${name}.glb`
    const target = join(staging, `${name}.glb`)
    const source = await download(path)
    const compress = async (textureSize, ratio) => {
      const doc = await io.read(source)
      for (const ext of doc.getRoot().listExtensionsUsed()) if (ext.extensionName === 'KHR_draco_mesh_compression') ext.dispose()
      const steps = [dedup(), prune(), weld()]
      if (ratio < 1) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.002 }))
      steps.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [textureSize, textureSize] }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
      await doc.transform(...steps)
      await io.write(target, doc)
      return statSync(target).size
    }
    let bytes = 0
    try {
      bytes = await compress(1024, 1)
      if (bytes / 1e6 > MAX_FILE_MB) {
        console.warn(`${path}: over ${MAX_FILE_MB} MB, retrying with 512 px textures and 50% simplification`)
        bytes = await compress(512, 0.5)
      }
    } catch (err) {
      console.warn(`${path}: skipped, the source model is unusable (${err.message.split('\n')[0]})`)
      bytes = Number.POSITIVE_INFINITY
    }
    if (bytes / 1e6 > MAX_FILE_MB) {
      rmSync(target, { force: true })
      built.set(path, null)
      if (Number.isFinite(bytes)) console.warn(`${path}: skipped, ${(bytes / 1e6).toFixed(2)} MB is over ${MAX_FILE_MB} MB`)
    } else {
      totalBytes += bytes
      built.set(path, rel)
      console.log(`${rel}: ${(statSync(source).size / 1e6).toFixed(2)} → ${(bytes / 1e6).toFixed(2)} MB`)
    }
  }
  if (built.get(path)) manifest.models[id] = { file: built.get(path), source: origin, credit, ...(sizeKm ? { sizeKm } : {}) }
}
if (totalBytes / 1e6 > MAX_TOTAL_MB) throw new Error(`models total ${(totalBytes / 1e6).toFixed(2)} MB, over ${MAX_TOTAL_MB} MB`)
writeFileSync(join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
rmSync(out, { recursive: true, force: true })
renameSync(staging, out)
console.log(`total ${(totalBytes / 1e6).toFixed(2)} MB for ${built.size} files, ${Object.keys(manifest.models).length} craft`)
