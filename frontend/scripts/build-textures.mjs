import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { FloatType } from 'three'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'

const frontend = join(dirname(fileURLToPath(import.meta.url)), '..')
const cache = process.env.TEXTURE_CACHE ?? join(frontend, '..', '.texture-cache')
const out = join(frontend, 'public', 'textures')
const TIERS = { low: 1024, medium: 2048, high: 4096 }
const WEBP = { quality: 82, effort: 5 }
sharp.cache(false)

const EO = 'https://eoimages.gsfc.nasa.gov/images/imagerecords'
const SVS = 'https://svs.gsfc.nasa.gov/vis/a000000'
const USGS = 'https://planetarymaps.usgs.gov/mosaic'

const SOURCES = {
  earthDay: [`${EO}/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg`, 'NASA Earth Observatory, Blue Marble Next Generation (Dec 2004, topography and bathymetry)'],
  earthNight: [`${EO}/144000/144898/BlackMarble_2016_3km.jpg`, 'NASA Earth Observatory, Black Marble 2016'],
  earthClouds: [`${EO}/57000/57747/cloud_combined_2048.jpg`, 'NASA Visible Earth, global cloud cover'],
  earthSpecular: [`${SVS}/a003400/a003487/landmask4K.png`, 'NASA Scientific Visualization Studio, land mask (inverted for ocean glint)'],
  moon: [`${SVS}/a004700/a004720/lroc_color_poles_4k.tif`, 'NASA Scientific Visualization Studio, CGI Moon Kit (LRO LROC colour)'],
  moonBump: [`${SVS}/a004700/a004720/ldem_3_8bit.jpg`, 'NASA Scientific Visualization Studio, CGI Moon Kit (LRO LOLA elevation)'],
  mercury: [`${USGS}/Mercury_MESSENGER_MDIS_Basemap_EnhancedColor_Mosaic_Global_665m.tif`, 'NASA/JHUAPL/CIW MESSENGER MDIS global mosaic via USGS Astrogeology (enhanced colour, desaturated toward natural colour)'],
  mars: [`${USGS}/Mars_Viking_ClrMosaic_global_925m.tif`, 'NASA Viking colour mosaic via USGS Astrogeology'],
  jupiter: ['https://assets.science.nasa.gov/content/dam/science/psd/solar/2023/09/p/PIA07782.jpg', 'NASA/JPL/University of Arizona, Cassini map of Jupiter (PIA07782)'],
}
const OWN_WORK = 'Generated for this project (procedural)'

async function download(url) {
  mkdirSync(cache, { recursive: true })
  const file = join(cache, url.split('/').pop())
  if (existsSync(file) && statSync(file).size > 0) return file
  const res = await fetch(url, { headers: { 'User-Agent': 'solar-system-model texture build' } })
  if (!res.ok || !res.body) throw new Error(`${url}: ${res.status}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(`${file}.part`))
  renameSync(`${file}.part`, file)
  return file
}

const manifest = { version: 1, textures: {} }

async function emit(key, folder, name, image, sourceWidth, credit) {
  mkdirSync(join(out, folder), { recursive: true })
  const files = {}
  const written = new Map()
  for (const [tier, target] of Object.entries(TIERS)) {
    const width = Math.min(target, sourceWidth - (sourceWidth % 2))
    if (!written.has(width)) {
      const rel = `textures/${folder}/${name}-${width}.webp`
      await image().resize(width, width / 2, { kernel: 'lanczos3', fit: 'fill' }).webp(WEBP).toFile(join(frontend, 'public', rel))
      written.set(width, rel)
    }
    files[tier] = written.get(width)
  }
  manifest.textures[key] = { ...files, credit }
}

async function fromSource(key, folder, name, transform = (img) => img) {
  const [url, credit] = SOURCES[key]
  const file = await download(url)
  const open = () => sharp(file, { limitInputPixels: false, unlimited: true })
  const { width } = await open().metadata()
  await emit(key, folder, name, () => transform(open()), width, credit)
}

function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), s | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function valueNoise(width, height, cells, seed) {
  const r = rng(seed)
  const cy = Math.max(2, Math.round(cells / 2))
  const grid = Array.from({ length: (cy + 1) * cells }, () => r())
  const at = (x, y) => grid[y * cells + (x % cells)]
  const smooth = (t) => t * t * (3 - 2 * t)
  return (px, py) => {
    const fx = (px / width) * cells
    const fy = (py / height) * cy
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const tx = smooth(fx - x0)
    const ty = smooth(fy - y0)
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx
    return a + (b - a) * ty
  }
}

function fractal(width, height, seed, octaves) {
  const layers = octaves.map(([cells, weight], i) => [valueNoise(width, height, cells, seed + i * 101), weight])
  const total = octaves.reduce((s, [, w]) => s + w, 0)
  return (x, y) => layers.reduce((s, [n, w]) => s + n(x, y) * w, 0) / total
}

async function generated(key, folder, name, width, shade) {
  const height = width / 2
  const pixels = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = shade(x, y, width, height)
      const i = (y * width + x) * 3
      pixels[i] = r
      pixels[i + 1] = g
      pixels[i + 2] = b
    }
  }
  const open = () => sharp(pixels, { raw: { width, height, channels: 3 } })
  await emit(key, folder, name, open, width, OWN_WORK)
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * Math.min(1, Math.max(0, t))))

async function ring(key, folder, name, profile) {
  const width = 1024
  const height = 16
  const pixels = Buffer.alloc(width * height * 4)
  for (let x = 0; x < width; x++) {
    const [r, g, b, a] = profile(x / (width - 1))
    for (let y = 0; y < height; y++) pixels.set([r, g, b, a], (y * width + x) * 4)
  }
  const rel = `textures/${folder}/${name}.png`
  mkdirSync(join(out, folder), { recursive: true })
  await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toFile(join(frontend, 'public', rel))
  manifest.textures[key] = { low: rel, medium: rel, high: rel, credit: OWN_WORK }
}

function saturnRing(u) {
  const r = 1.25 + u * (2.3 - 1.25)
  const fine = 0.85 + 0.15 * Math.sin(r * 900) * Math.sin(r * 310)
  const band = (lo, hi) => r >= lo && r <= hi
  if (Math.abs(r - 2.214) < 0.004) return [0, 0, 0, 0]
  if (band(1.24, 1.53)) return [150, 135, 115, Math.round(40 * fine)]
  if (band(1.53, 1.95)) return [228, 208, 170, Math.round(235 * fine)]
  if (band(1.95, 2.03)) return [90, 80, 70, 25]
  if (band(2.03, 2.27)) return [205, 188, 155, Math.round(175 * fine)]
  if (Math.abs(r - 2.33) < 0.006) return [200, 190, 170, 120]
  return [0, 0, 0, 0]
}

function uranusRing(u) {
  const r = 1.6 + u * (2.05 - 1.6)
  const rings = [1.64, 1.66, 1.68, 1.75, 1.77, 1.79, 1.84, 1.86, 1.9]
  if (Math.abs(r - 2.0) < 0.012) return [120, 125, 130, 150]
  if (rings.some((x) => Math.abs(r - x) < 0.003)) return [100, 105, 110, 90]
  return [0, 0, 0, 0]
}

rmSync(out, { recursive: true, force: true })
await fromSource('earthDay', 'earth', 'day')
await fromSource('earthNight', 'earth', 'night')
await fromSource('earthClouds', 'earth', 'clouds')
await fromSource('earthSpecular', 'earth', 'specular', (img) => img.negate({ alpha: false }))
await fromSource('moon', 'moon', 'color')
await fromSource('moonBump', 'moon', 'bump')
await fromSource('mercury', 'mercury', 'color', (img) => img.modulate({ saturation: 0.15 }).tint({ r: 214, g: 200, b: 186 }))
await fromSource('mars', 'mars', 'color')
await fromSource('jupiter', 'jupiter', 'color')

const granulation = fractal(2048, 1024, 7, [[24, 1], [64, 0.6], [160, 0.35], [400, 0.2]])
await generated('sun', 'sun', 'color', 2048, (x, y) => mix([235, 120, 25], [255, 225, 140], granulation(x, y) * 1.3 - 0.15))
const bands = fractal(2048, 1024, 31, [[6, 1], [20, 0.4], [60, 0.15]])
await generated('venus', 'venus', 'clouds', 2048, (x, y, w, h) => {
  const lat = (y / h) * Math.PI
  const t = 0.55 + 0.25 * Math.sin(lat * 7 + bands(x, y) * 4) + 0.2 * (bands(x, y) - 0.5)
  return mix([196, 160, 104], [240, 222, 180], t)
})
function bandedGiant(seed, stops, waviness, turbulence) {
  const noise = fractal(2048, 1024, seed, [[8, 1], [32, 0.5], [96, 0.25]])
  return (x, y, w, h) => {
    const lat = y / h
    const t = Math.min(0.999, Math.max(0, lat + waviness * Math.sin(lat * Math.PI * 22 + noise(x, y) * 6) + turbulence * (noise(x, y) - 0.5)))
    const f = t * (stops.length - 1)
    const i = Math.floor(f)
    return mix(stops[i], stops[i + 1], f - i)
  }
}
await generated('saturn', 'saturn', 'color', 2048, bandedGiant(51, [[196, 176, 140], [214, 190, 140], [228, 204, 152], [205, 172, 118], [232, 210, 160], [214, 186, 136], [226, 202, 150], [200, 174, 128], [180, 160, 128]], 0.006, 0.02))
await generated('uranus', 'uranus', 'color', 2048, bandedGiant(61, [[160, 214, 222], [172, 226, 232], [176, 230, 236], [170, 224, 230], [158, 210, 220]], 0.002, 0.008))
await generated('neptune', 'neptune', 'color', 2048, bandedGiant(71, [[64, 104, 196], [74, 118, 214], [58, 92, 182], [86, 132, 222], [62, 100, 190], [70, 112, 206], [56, 88, 176]], 0.005, 0.03))
await ring('saturnRing', 'saturn', 'ring', saturnRing)
await ring('uranusRing', 'uranus', 'ring', uranusRing)

async function milkyWay() {
  const file = await download(`${SVS}/a004800/a004851/milkyway_2020_4k.exr`)
  const bytes = readFileSync(file)
  const exr = new EXRLoader().setDataType(FloatType).parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  const { width, height, data } = exr
  const channels = data.length / (width * height)
  const lum = new Float32Array(width * height)
  for (let i = 0; i < width * height; i++) lum[i] = 0.2126 * data[i * channels] + 0.7152 * data[i * channels + 1] + 0.0722 * data[i * channels + 2]
  const white = Float32Array.from(lum).sort()[Math.floor(lum.length * 0.998)]
  const encode = (v) => {
    const x = Math.min(1, Math.max(0, v))
    return Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055))
  }
  const sample = (raDeg, decDeg, flipped) => {
    const x = Math.floor((((0.5 - raDeg / 360) % 1) + 1) % 1 * width)
    const row = Math.floor(((90 - decDeg) / 180) * height)
    return lum[(flipped ? height - 1 - row : row) * width + x]
  }
  const flipped = sample(266.4, -28.9, false) < sample(266.4, 28.9, false)
  const pixels = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y++) {
    const src = flipped ? height - 1 - y : y
    for (let x = 0; x < width; x++) {
      const i = src * width + x
      for (let c = 0; c < 3; c++) {
        const v = data[i * channels + c] / white
        pixels[(y * width + x) * 3 + c] = encode(v / (1 + 0.35 * v))
      }
    }
  }
  console.log(`milky way: ${width}x${height}, rows ${flipped ? 'flipped' : 'as stored'}, galactic centre ${sample(266.4, -28.9, flipped).toFixed(3)} vs Hercules ${sample(266.4, 28.9, flipped).toFixed(3)}`)
  await emit('milkyWay', 'sky', 'milkyway', () => sharp(pixels, { raw: { width, height, channels: 3 } }), width, 'NASA/Goddard Space Flight Center Scientific Visualization Studio, Deep Star Maps 2020 (Milky Way); Gaia DR2: ESA/Gaia/DPAC')
}
await milkyWay()

const BUDGET_MB = { low: 2, medium: 6, high: 18 }
for (const [tier, limit] of Object.entries(BUDGET_MB)) {
  const unique = new Set(Object.values(manifest.textures).map((t) => t[tier]))
  const mb = [...unique].reduce((s, rel) => s + statSync(join(frontend, 'public', rel)).size, 0) / 1e6
  console.log(`${tier}: ${mb.toFixed(2)} MB`)
  if (mb > limit) throw new Error(`${tier} tier is ${mb.toFixed(2)} MB, over its ${limit} MB budget`)
}

writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(Object.entries(manifest.textures).map(([k, v]) => `${k}: ${v.low} | ${v.medium} | ${v.high}`).join('\n'))
