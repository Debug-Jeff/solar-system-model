import { useEffect, useState } from 'react'
import models from '../../public/models/manifest.json'
import textures from '../../public/textures/manifest.json'

type Item = { label: string; href?: string; note?: string }

const DATA: Item[] = [
  { label: 'JPL Horizons', href: 'https://ssd.jpl.nasa.gov/horizons/', note: 'positions of moons and spacecraft' },
  { label: 'JPL Small-Body Database', href: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html', note: 'asteroid, comet and meteor-shower parent orbits' },
  { label: 'NASA NeoWs', href: 'https://api.nasa.gov', note: 'near-Earth object close approaches' },
  { label: 'CelesTrak', href: 'https://celestrak.org', note: 'Earth satellite orbital elements' },
  { label: 'IMO 2026 Meteor Shower Calendar', href: 'https://www.imo.net/resources/calendar/', note: 'shower dates, peaks and rates' },
  { label: 'NASA APOD, DSCOVR EPIC and GIBS', href: 'https://api.nasa.gov', note: 'imagery' },
]

const LIBRARIES: Item[] = [
  { label: 'Three.js', href: 'https://threejs.org', note: 'MIT' },
  { label: 'React', href: 'https://react.dev', note: 'MIT' },
  { label: 'Zustand', href: 'https://github.com/pmndrs/zustand', note: 'MIT' },
  { label: 'Astronomy Engine', href: 'https://github.com/cosinekitty/astronomy', note: 'MIT, by Don Cross' },
  { label: 'satellite.js', href: 'https://github.com/shashwatak/satellite-js', note: 'MIT' },
]

const unique = (values: string[]) => [...new Set(values)]
const TEXTURE_CREDITS = unique(Object.values(textures.textures).map((t) => t.credit))
const MODEL_CREDITS = unique(Object.values(models.models).map((m) => m.credit))

function Link({ item }: { item: Item }) {
  return (
    <li>
      {item.href ? (
        <a href={item.href} target="_blank" rel="noopener noreferrer">
          {item.label}
        </a>
      ) : (
        item.label
      )}
      {item.note && <span className="credit-note"> — {item.note}</span>}
    </li>
  )
}

export function CreditsLink() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button className="link-btn" onClick={() => setOpen(true)}>
        Credits
      </button>
      {open && (
        <div id="credits" role="dialog" aria-modal="true" aria-label="Credits" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="credits-card">
            <button className="credits-close" aria-label="Close credits" onClick={() => setOpen(false)}>
              ×
            </button>
            <h2>Credits</h2>
            <h3>Data</h3>
            <ul>{DATA.map((item) => <Link key={item.label} item={item} />)}</ul>
            <h3>Stars and constellations</h3>
            <ul>
              <li>Yale Bright Star Catalogue, 5th revised edition (Hoffleit &amp; Warren, 1991), via NASA HEASARC.</li>
              <li>
                Constellation lines: ConstellationLines by Marc van der Sluys (doi:10.5281/zenodo.10397192), licensed{' '}
                <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">
                  CC BY 4.0
                </a>
                ; converted from HR-number polylines to pairs of indices into this app's star list.
              </li>
            </ul>
            <h3>Planet textures</h3>
            <ul>{TEXTURE_CREDITS.map((credit) => <li key={credit}>{credit}</li>)}</ul>
            <h3>3D models</h3>
            <ul>{MODEL_CREDITS.map((credit) => <li key={credit}>{credit}</li>)}</ul>
            <h3>Libraries</h3>
            <ul>{LIBRARIES.map((item) => <Link key={item.label} item={item} />)}</ul>
            <p className="credits-disclaimer">This project is not affiliated with or endorsed by NASA or JPL.</p>
          </div>
        </div>
      )}
    </>
  )
}
