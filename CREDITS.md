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

## 3D models

Spacecraft and satellite models come from [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources), which are free and without copyright. They're used under [NASA's media usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media), and no endorsement by NASA is implied. Each model is compressed by `frontend/scripts/build-models.mjs`, and its source path is listed in `frontend/public/models/manifest.json`.

## Textures

All planet and moon maps are public-domain NASA, JPL and USGS imagery, resized and converted to WebP by `frontend/scripts/build-textures.mjs`:

- Earth: [Blue Marble Next Generation](https://visibleearth.nasa.gov/collection/1484/blue-marble), [Black Marble 2016](https://earthobservatory.nasa.gov/features/NightLights) and the global cloud map from NASA Earth Observatory / Visible Earth. The ocean glint uses the land mask from the [NASA Scientific Visualization Studio](https://svs.gsfc.nasa.gov/3487).
- Moon: [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720), NASA Scientific Visualization Studio (LRO LROC colour and LOLA elevation).
- Mercury: MESSENGER MDIS global mosaic (NASA/JHUAPL/Carnegie Institution of Washington) via [USGS Astrogeology](https://astrogeology.usgs.gov). The enhanced-colour version is desaturated toward natural colour.
- Mars: Viking colour mosaic (NASA) via USGS Astrogeology.
- Jupiter: Cassini map [PIA07782](https://science.nasa.gov/resource/cassinis-best-maps-of-jupiter/) (NASA/JPL/University of Arizona).
- The Sun, Venus's cloud deck, the cloud bands of Saturn, Uranus and Neptune, and Saturn's and Uranus's rings are generated for this project; no public-domain global maps of the giant planets' cloud tops are available. The ring textures follow the real structure: Saturn's C, B and A rings, the Cassini Division, the Encke gap and the F ring, and Uranus's narrow rings and wider epsilon ring.

This project is not affiliated with or endorsed by NASA or JPL.
