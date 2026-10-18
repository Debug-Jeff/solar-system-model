import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const frontend = join(dirname(fileURLToPath(import.meta.url)), '..')
const STARS_URL = 'https://heasarc.gsfc.nasa.gov/FTP/heasarc/dbase/tdat_files/heasarc_bsc5p.tdat.gz'
const LINES_URL = 'https://raw.githubusercontent.com/MarcvdSluys/ConstellationLines/master/ConstellationLines.csv'
const DEFAULT_BV = 0.6
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d

async function fetchBytes(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

const tdat = gunzipSync(await fetchBytes(STARS_URL)).toString('latin1')
const columns = tdat.match(/^line\[1\] = (.+)$/m)[1].trim().split(/\s+/)
const col = (name) => {
  const i = columns.indexOf(name)
  if (i < 0) throw new Error(`missing column ${name}`)
  return i
}
const [RA, DEC, VMAG, BV, HR] = ['ra', 'dec', 'vmag', 'bv_color', 'hr'].map(col)
const rows = tdat.split('<DATA>')[1].split('<END>')[0].trim().split('\n')
const stars = []
for (const row of rows) {
  const f = row.split('|')
  const ra = parseFloat(f[RA])
  const dec = parseFloat(f[DEC])
  const vmag = parseFloat(f[VMAG])
  const hr = parseInt(f[HR], 10)
  if (![ra, dec, vmag].every(Number.isFinite) || !Number.isInteger(hr)) continue
  const bv = parseFloat(f[BV])
  stars.push({ hr, ra, dec, vmag, bv: Number.isFinite(bv) ? bv : DEFAULT_BV })
}
stars.sort((a, b) => a.vmag - b.vmag || a.hr - b.hr)
const indexOf = new Map(stars.map((s, i) => [s.hr, i]))

const csv = (await fetchBytes(LINES_URL)).toString('utf8').trim().split('\n').slice(1)
const constellations = {}
let previous = ''
for (const line of csv) {
  const [own, , ...rest] = line.split(',').map((s) => s.trim())
  const abbr = own || previous
  if (!abbr) throw new Error('continuation line before any constellation')
  previous = abbr
  const hrs = rest.filter(Boolean).map(Number)
  const pairs = (constellations[abbr] ??= [])
  for (let k = 1; k < hrs.length; k++) {
    const a = indexOf.get(hrs[k - 1])
    const b = indexOf.get(hrs[k])
    if (a === undefined || b === undefined) throw new Error(`${abbr}: unknown HR ${hrs[k - 1]} or ${hrs[k]}`)
    if (a !== b) pairs.push(a, b)
  }
}

const file = {
  version: 1,
  attribution:
    'Stars: Yale Bright Star Catalogue, 5th rev. ed. (Hoffleit & Warren 1991), via NASA HEASARC. Constellation lines: Marc van der Sluys, ConstellationLines (doi:10.5281/zenodo.10397192), CC BY 4.0.',
  stars: stars.flatMap((s) => [round(s.ra, 4), round(s.dec, 4), round(s.vmag, 2), round(s.bv, 2)]),
  constellations,
}
writeFileSync(join(frontend, 'public', 'data', 'sky.json'), JSON.stringify(file))
console.log(`${stars.length} stars, ${Object.keys(constellations).length} constellations`)
