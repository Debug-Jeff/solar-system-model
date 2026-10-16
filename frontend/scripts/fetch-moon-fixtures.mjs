import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontend = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(frontend, 'src', 'ephemeris', 'fixtures', 'moons-frozen')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OFFSETS_DAYS = [10.37, 29.81, 47.13]
const BODIES = [
  { id: 'moon', set: 'moons-earth', command: '301', center: '500@399' },
  { id: 'phobos', set: 'moons-mars', command: '401', center: '500@499' },
  { id: 'io', set: 'moons-jupiter', command: '501', center: '500@599' },
]

mkdirSync(out, { recursive: true })
const reference = {}
for (const body of BODIES) {
  const src = join(frontend, 'public', 'data', 'ephem', `${body.set}.json`)
  copyFileSync(src, join(out, `${body.set}.json`))
  const startJd = JSON.parse(readFileSync(src, 'utf8')).startJd
  const params = new URLSearchParams({
    format: 'json',
    COMMAND: `'${body.command}'`,
    CENTER: `'${body.center}'`,
    EPHEM_TYPE: 'VECTORS',
    REF_PLANE: 'ECLIPTIC',
    REF_SYSTEM: 'ICRF',
    OUT_UNITS: 'KM-S',
    VEC_TABLE: '1',
    CSV_FORMAT: 'YES',
    TIME_TYPE: 'UT',
    TLIST: OFFSETS_DAYS.map((d) => (startJd + d).toFixed(6)).join(' '),
  })
  const res = await fetch(`https://ssd.jpl.nasa.gov/api/horizons.api?${params}`)
  if (!res.ok) throw new Error(`${body.id}: ${res.status}`)
  const json = await res.json()
  if (json.error) throw new Error(`${body.id}: ${json.error}`)
  const block = json.result.split('$$SOE')[1]?.split('$$EOE')[0]
  if (!block) throw new Error(`${body.id}: no $$SOE block`)
  reference[body.id] = block
    .trim()
    .split('\n')
    .map((line) => line.split(',').map((s) => s.trim()))
    .map((c) => ({ jd: Number(c[0]), x: Number(c[2]), y: Number(c[3]), z: Number(c[4]) }))
  await sleep(300)
}
writeFileSync(join(out, 'reference.json'), JSON.stringify(reference, null, 2) + '\n')
console.log(Object.fromEntries(Object.entries(reference).map(([k, v]) => [k, v.length])))
