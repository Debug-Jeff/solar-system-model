import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'ephemeris')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const YEAR_DAYS = 365.25
const MAX_JD = 2470171.5

const SMALL_BODIES = { ceres: '1', halley: '1P', encke: '2P' }
const HORIZONS = {
  mercury: "'199'",
  venus: "'299'",
  earth: "'399'",
  mars: "'499'",
  jupiter: "'599'",
  saturn: "'699'",
  uranus: "'799'",
  neptune: "'899'",
  pluto: "'999'",
  ceres: "'1;'",
  halley: "'DES=1P;CAP;NOFRAG'",
  encke: "'DES=2P;CAP;NOFRAG'",
}
const PLANET_DATES_JD = [2415020.5, 2433447.5, 2451544.5, 2461329.5, 2470171.5]

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} responded ${res.status}`)
  const body = await res.json()
  if (body.error) throw new Error(`${url}: ${body.error}`)
  return body
}

async function fetchElements() {
  const out = {}
  for (const [id, sstr] of Object.entries(SMALL_BODIES)) {
    const body = await getJson(`https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=${encodeURIComponent(sstr)}&full-prec=1`)
    const el = Object.fromEntries(body.orbit.elements.map((e) => [e.name, Number(e.value)]))
    out[id] = { epochJd: Number(body.orbit.epoch), a: el.a, e: el.e, i: el.i, om: el.om, w: el.w, ma: el.ma, n: el.n }
    for (const [k, v] of Object.entries(out[id])) {
      if (!Number.isFinite(v)) throw new Error(`${id}.${k} is not finite`)
    }
    await sleep(300)
  }
  return out
}

function datesFor(id, elements) {
  const el = elements[id]
  if (!el) return PLANET_DATES_JD
  if (id === 'ceres') {
    return [-50, -10, 0, 10, 24].map((years) => Math.min(el.epochJd + years * YEAR_DAYS, MAX_JD))
  }
  return [el.epochJd - YEAR_DAYS, el.epochJd, el.epochJd + YEAR_DAYS]
}

async function fetchVectors(elements) {
  const out = {}
  for (const [id, command] of Object.entries(HORIZONS)) {
    const params = new URLSearchParams({
      format: 'json',
      COMMAND: command,
      EPHEM_TYPE: 'VECTORS',
      CENTER: "'500@10'",
      REF_PLANE: 'ECLIPTIC',
      REF_SYSTEM: 'ICRF',
      OUT_UNITS: 'AU-D',
      VEC_TABLE: '1',
      CSV_FORMAT: 'YES',
      TIME_TYPE: 'UT',
      TLIST: datesFor(id, elements).map((jd) => jd.toFixed(1)).join(' '),
    })
    const body = await getJson(`https://ssd.jpl.nasa.gov/api/horizons.api?${params}`)
    const block = body.result.split('$$SOE')[1]?.split('$$EOE')[0]
    if (!block) throw new Error(`${id}: no $$SOE block\n${body.result.slice(0, 2000)}`)
    out[id] = block
      .trim()
      .split('\n')
      .map((line) => line.split(',').map((s) => s.trim()))
      .map((cols) => ({ jd: Number(cols[0]), x: Number(cols[2]), y: Number(cols[3]), z: Number(cols[4]) }))
    await sleep(300)
  }
  return out
}

const elements = await fetchElements()
const vectors = await fetchVectors(elements)
mkdirSync(join(root, 'data'), { recursive: true })
mkdirSync(join(root, 'fixtures'), { recursive: true })
writeFileSync(join(root, 'data', 'smallBodyElements.json'), JSON.stringify(elements, null, 2) + '\n')
writeFileSync(join(root, 'fixtures', 'horizons.json'), JSON.stringify(vectors, null, 2) + '\n')
console.log(Object.fromEntries(Object.entries(vectors).map(([k, v]) => [k, v.length])))
