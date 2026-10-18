import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Body, HelioVector, MakeTime, RotateVector, Rotation_EQJ_ECL } from 'astronomy-engine'

const frontend = join(dirname(fileURLToPath(import.meta.url)), '..')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const K_DEG_PER_DAY = 0.9856076686
const EQJ_TO_ECL = Rotation_EQJ_ECL()

const SHOWERS = [
  ['QUA', 'Quadrantids', '2003 EH1', '2025-12-28', 283.15, '2026-01-12', 80, 41],
  ['LYR', 'Lyrids', 'C/1861 G1', '2026-04-14', 32.32, '2026-04-30', 18, 49],
  ['ETA', 'Eta Aquariids', '1P', '2026-04-19', 45.5, '2026-05-28', 50, 66],
  ['SDA', 'Southern Delta Aquariids', '96P', '2026-07-12', 127, '2026-08-23', 25, 41],
  ['PER', 'Perseids', '109P', '2026-07-17', 140.0, '2026-08-24', 100, 59],
  ['DRA', 'Draconids', '21P', '2026-10-06', 195.4, '2026-10-10', 10, 21],
  ['STA', 'Southern Taurids', '2P', '2026-09-10', 197, '2026-11-20', 5, 27],
  ['ORI', 'Orionids', '1P', '2026-10-02', 208, '2026-11-07', 20, 66],
  ['NTA', 'Northern Taurids', '2P', '2026-10-20', 230, '2026-12-10', 5, 29],
  ['LEO', 'Leonids', '55P', '2026-11-06', 235.27, '2026-11-30', 15, 71],
  ['GEM', 'Geminids', '3200', '2026-12-04', 262.2, '2026-12-20', 150, 35],
  ['URS', 'Ursids', '8P', '2026-12-17', 270.7, '2026-12-26', 10, 33],
]

function solarLongitude(iso) {
  const v = RotateVector(EQJ_TO_ECL, HelioVector(Body.Earth, MakeTime(new Date(`${iso}T12:00:00Z`))))
  return Math.round((((Math.atan2(v.y, v.x) * 180) / Math.PI + 180 + 360) % 360) * 100) / 100
}

async function elements(designation) {
  const url = `https://ssd-api.jpl.nasa.gov/sbdb.api?${new URLSearchParams({ sstr: designation, 'full-prec': '1' })}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${designation}: ${res.status}`)
  const json = await res.json()
  const orbit = json.orbit
  if (!orbit) throw new Error(`${designation}: no orbit (${JSON.stringify(json).slice(0, 200)})`)
  const v = Object.fromEntries(orbit.elements.map((el) => [el.name, Number(el.value)]))
  const epochJd = Number(orbit.epoch)
  const a = v.a
  const e = v.e
  if (!(e >= 0 && e < 0.995) || !(a > 0)) throw new Error(`${designation}: unbound or extreme orbit e=${e} a=${a}`)
  const n = Number.isFinite(v.n) ? v.n : K_DEG_PER_DAY / Math.pow(a, 1.5)
  const ma = Number.isFinite(v.ma) ? v.ma : ((((epochJd - v.tp) * n) % 360) + 360) % 360
  const el = { epochJd, a, e, i: v.i, om: v.om, w: v.w, ma, n }
  for (const [k, x] of Object.entries(el)) if (!Number.isFinite(x)) throw new Error(`${designation}: bad ${k}`)
  return { name: json.object.fullname, elements: el }
}

const cache = new Map()
const showers = []
for (const [code, name, parent, start, peakLon, end, zhr, speedKmS] of SHOWERS) {
  if (!cache.has(parent)) {
    cache.set(parent, await elements(parent))
    await sleep(500)
  }
  const p = cache.get(parent)
  showers.push({ code, name, parentName: p.name, startLon: solarLongitude(start), peakLon, endLon: solarLongitude(end), zhr, speedKmS, elements: p.elements })
}
const file = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: 'Dates, peak solar longitudes and rates: IMO 2026 Meteor Shower Calendar. Parent orbits: JPL Small-Body Database.',
  showers,
}
writeFileSync(join(frontend, 'public', 'data', 'meteor-showers.json'), JSON.stringify(file))
console.log(showers.map((s) => `${s.code} ${s.peakLon} e=${s.elements.e.toFixed(3)} ${s.parentName}`).join('\n'))
