import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontend = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(frontend, 'src', 'satellites', 'fixtures')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const FROZEN = ['iss', 'hubble', 'goes-19', 'chandra']
const HORIZONS = { iss: '-125544', hubble: '-48', chandra: '-151' }
const OFFSETS_DAYS = [0.25, 2]

const file = JSON.parse(readFileSync(join(frontend, 'public', 'data', 'satellites.json'), 'utf8'))
const frozen = { version: 1, generatedAt: file.generatedAt, satellites: file.satellites.filter((s) => FROZEN.includes(s.id)) }
if (frozen.satellites.length !== FROZEN.length) throw new Error('a frozen satellite is missing from satellites.json')

mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'frozen.json'), JSON.stringify(frozen, null, 2) + '\n')

const reference = {}
for (const [id, command] of Object.entries(HORIZONS)) {
  const omm = frozen.satellites.find((s) => s.id === id).omm
  const epochJd = Date.parse(`${omm.EPOCH}Z`) / 86_400_000 + 2440587.5
  const params = new URLSearchParams({
    format: 'json',
    COMMAND: `'${command}'`,
    CENTER: "'500@399'",
    EPHEM_TYPE: 'VECTORS',
    REF_PLANE: 'ECLIPTIC',
    REF_SYSTEM: 'ICRF',
    OUT_UNITS: 'KM-S',
    VEC_TABLE: '1',
    CSV_FORMAT: 'YES',
    TIME_TYPE: 'UT',
    TLIST: OFFSETS_DAYS.map((d) => (epochJd + d).toFixed(6)).join(' '),
  })
  const res = await fetch(`https://ssd.jpl.nasa.gov/api/horizons.api?${params}`)
  if (!res.ok) throw new Error(`${id}: ${res.status}`)
  const json = await res.json()
  if (json.error) throw new Error(`${id}: ${json.error}`)
  const block = json.result.split('$$SOE')[1]?.split('$$EOE')[0]
  if (!block) throw new Error(`${id}: no $$SOE block\n${json.result.slice(0, 600)}`)
  reference[id] = block
    .trim()
    .split('\n')
    .map((line) => line.split(',').map((s) => s.trim()))
    .map((c) => ({ jd: Number(c[0]), x: Number(c[2]), y: Number(c[3]), z: Number(c[4]) }))
  await sleep(500)
}
writeFileSync(join(out, 'reference.json'), JSON.stringify(reference, null, 2) + '\n')
console.log(Object.fromEntries(Object.entries(reference).map(([k, v]) => [k, v.length])))
