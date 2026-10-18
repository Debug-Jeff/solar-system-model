# Credits

## Libraries

- [Three.js](https://threejs.org) — MIT
- [React](https://react.dev) — MIT
- [Zustand](https://github.com/pmndrs/zustand) — MIT
- [Astronomy Engine](https://github.com/cosinekitty/astronomy) by Don Cross — MIT. Planet and Pluto positions.
- [satellite.js](https://github.com/shashwatak/satellite-js) — MIT. SGP4 propagation for Earth satellites.

## Data

- [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) — sampled positions of moons and spacecraft, and reference vectors used to test position accuracy.
- [JPL Small-Body Database](https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html) — orbital elements for Ceres, 1P/Halley and 2P/Encke.
- [CelesTrak](https://celestrak.org) — orbital elements (GP/OMM) for the Earth satellites.
- Meteor showers: dates, peak solar longitudes and rates from the [IMO 2026 Meteor Shower Calendar](https://www.imo.net/resources/calendar/); parent orbits from the [JPL Small-Body Database](https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html).
- Stars: the Yale Bright Star Catalogue, 5th revised edition (Hoffleit & Warren, 1991), from [NASA HEASARC](https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/bsc5p.html).
- Constellation lines: [ConstellationLines](https://github.com/MarcvdSluys/ConstellationLines) by Marc van der Sluys ([doi:10.5281/zenodo.10397192](https://doi.org/10.5281/zenodo.10397192)), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Converted from HR-number polylines to pairs of indices into the star list in `frontend/public/data/sky.json`; the line figures themselves are unchanged.
- [NASA APOD](https://apod.nasa.gov), [DSCOVR EPIC](https://epic.gsfc.nasa.gov) and [NASA GIBS](https://www.earthdata.nasa.gov/gibs) — imagery via api.nasa.gov.

## Textures

The planet textures in `frontend/public/textures/` have no recorded source yet. They will be identified and credited, or replaced with NASA public-domain maps, on the `feat/textures-and-quality` branch.

This project is not affiliated with or endorsed by NASA or JPL.
