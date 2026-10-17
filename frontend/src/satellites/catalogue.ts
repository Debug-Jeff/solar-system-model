import type { Body } from '../types/body'

export interface SatelliteInfo {
  id: string
  name: string
  norad: number
  purpose: string
  launched: string
  sizeM: number
  facts: string[]
}

export const SATELLITES: SatelliteInfo[] = [
  { id: 'iss', name: 'International Space Station', norad: 25544, purpose: 'Crewed orbital laboratory', launched: '1998-11-20', sizeM: 109, facts: ['Continuously crewed since November 2000.', 'About the size of a football field, it laps Earth roughly every 93 minutes.'] },
  { id: 'tiangong', name: 'Tiangong space station', norad: 48274, purpose: 'Chinese crewed space station', launched: '2021-04-29', sizeM: 55, facts: ['Its core module, Tianhe, launched in April 2021.', 'Crews of three live aboard on rotations of about six months.'] },
  { id: 'hubble', name: 'Hubble Space Telescope', norad: 20580, purpose: 'Optical and ultraviolet space telescope', launched: '1990-04-24', sizeM: 13.2, facts: ['Launched by Space Shuttle Discovery and serviced by astronauts five times.', 'Its 2.4 m mirror has made more than 1.5 million observations.'] },
  { id: 'chandra', name: 'Chandra X-ray Observatory', norad: 25867, purpose: 'X-ray space telescope', launched: '1999-07-23', sizeM: 13.8, facts: ['Its long elliptical orbit reaches about a third of the way to the Moon.', 'Named after the astrophysicist Subrahmanyan Chandrasekhar.'] },
  { id: 'swift', name: 'Neil Gehrels Swift Observatory', norad: 28485, purpose: 'Gamma-ray burst observatory', launched: '2004-11-20', sizeM: 5.6, facts: ['Can swing round to a new gamma-ray burst within about a minute.', 'Renamed in 2018 after its principal investigator, Neil Gehrels.'] },
  { id: 'fermi', name: 'Fermi Gamma-ray Space Telescope', norad: 33053, purpose: 'Gamma-ray space telescope', launched: '2008-06-11', sizeM: 3, facts: ['Its Large Area Telescope scans the whole sky every three hours.', 'Named after the physicist Enrico Fermi.'] },
  { id: 'landsat-8', name: 'Landsat 8', norad: 39084, purpose: 'Earth imaging', launched: '2013-02-11', sizeM: 4, facts: ['Part of the Landsat record of Earth’s land surface that began in 1972.', 'Images every point on Earth about every 16 days.'] },
  { id: 'landsat-9', name: 'Landsat 9', norad: 49260, purpose: 'Earth imaging', launched: '2021-09-27', sizeM: 4, facts: ['Flies with Landsat 8 so that together they image any spot every 8 days.', 'Nearly a copy of Landsat 8, with an improved thermal sensor.'] },
  { id: 'terra', name: 'Terra', norad: 25994, purpose: 'Earth observing: land, oceans and atmosphere', launched: '1999-12-18', sizeM: 7, facts: ['The flagship of NASA’s Earth Observing System.', 'Carries five instruments, including MODIS and ASTER.'] },
  { id: 'aqua', name: 'Aqua', norad: 27424, purpose: 'Water cycle and climate', launched: '2002-05-04', sizeM: 8, facts: ['Measures water vapour, clouds, sea ice and rainfall.', 'Led the A-Train, a line of satellites crossing the equator in the early afternoon.'] },
  { id: 'aura', name: 'Aura', norad: 28376, purpose: 'Atmospheric chemistry', launched: '2004-07-15', sizeM: 7, facts: ['Tracks the ozone layer, air quality and climate gases.', 'Carries the Ozone Monitoring Instrument.'] },
  { id: 'sentinel-2a', name: 'Sentinel-2A', norad: 40697, purpose: 'Earth imaging for Copernicus', launched: '2015-06-23', sizeM: 3.4, facts: ['Part of the EU’s Copernicus programme, imaging land in 13 spectral bands.', 'Sweeps a strip of Earth 290 km wide.'] },
  { id: 'sentinel-2b', name: 'Sentinel-2B', norad: 42063, purpose: 'Earth imaging for Copernicus', launched: '2017-03-07', sizeM: 3.4, facts: ['Flies 180° apart from Sentinel-2A in the same orbit.', 'Together they revisit the equator every five days.'] },
  { id: 'sentinel-6a', name: 'Sentinel-6 Michael Freilich', norad: 46984, purpose: 'Sea-level altimetry', launched: '2020-11-21', sizeM: 5, facts: ['Measures global sea level to within a few centimetres.', 'Continues a sea-level record that began with TOPEX/Poseidon in 1992.'] },
  { id: 'icesat-2', name: 'ICESat-2', norad: 43613, purpose: 'Ice sheet and sea ice height', launched: '2018-09-15', sizeM: 4, facts: ['Fires 10,000 laser pulses a second at Earth.', 'Splits its laser into six beams to map ice sheets, sea ice and forests.'] },
  { id: 'swot', name: 'SWOT', norad: 54754, purpose: 'Surface water and ocean topography', launched: '2022-12-16', sizeM: 10, facts: ['A NASA–CNES mission surveying almost all of Earth’s surface water.', 'Measures lakes, rivers and reservoirs as well as the ocean.'] },
  { id: 'suomi-npp', name: 'Suomi NPP', norad: 37849, purpose: 'Weather and climate', launched: '2011-10-28', sizeM: 4, facts: ['Named after the weather-satellite pioneer Verner Suomi.', 'Its VIIRS instrument captured the Black Marble images of Earth at night.'] },
  { id: 'noaa-20', name: 'NOAA-20', norad: 43013, purpose: 'Polar-orbiting weather', launched: '2017-11-18', sizeM: 4, facts: ['The first of NOAA’s JPSS polar weather satellites.', 'Passes over every point on Earth twice a day.'] },
  { id: 'noaa-21', name: 'NOAA-21', norad: 54234, purpose: 'Polar-orbiting weather', launched: '2022-11-10', sizeM: 4, facts: ['Launched as JPSS-2 alongside the LOFTID inflatable heat-shield test.', 'Shares an orbit with NOAA-20, half an orbit apart.'] },
  { id: 'goes-16', name: 'GOES-16', norad: 41866, purpose: 'Geostationary weather', launched: '2016-11-19', sizeM: 6, facts: ['Served as GOES-East from 2017 until GOES-19 took over in April 2025.', 'Carried the first lightning mapper in geostationary orbit.'] },
  { id: 'goes-18', name: 'GOES-18', norad: 51850, purpose: 'Geostationary weather (GOES-West)', launched: '2022-03-01', sizeM: 6, facts: ['Watches the western Americas and the Pacific from about 137°W.', 'Its imager scans the full Earth disc every 10 minutes.'] },
  { id: 'goes-19', name: 'GOES-19', norad: 60133, purpose: 'Geostationary weather (GOES-East)', launched: '2024-06-25', sizeM: 6, facts: ['Became GOES-East in April 2025, stationed at about 75.2°W.', 'Carries a compact coronagraph that watches the Sun’s outer atmosphere.'] },
  { id: 'himawari-9', name: 'Himawari-9', norad: 41836, purpose: 'Geostationary weather for Japan', launched: '2016-11-02', sizeM: 6, facts: ['Japan’s operational weather satellite over the western Pacific since December 2022.', 'Himawari means “sunflower” in Japanese.'] },
  { id: 'gps-biii-1', name: 'GPS III SV01', norad: 43873, purpose: 'Navigation (GPS)', launched: '2018-12-23', sizeM: 6, facts: ['The first of the third-generation GPS satellites, nicknamed “Vespucci”.', 'GPS satellites circle Earth twice a day at about 20,200 km.'] },
  { id: 'gps-biii-6', name: 'GPS III SV06', norad: 55268, purpose: 'Navigation (GPS)', launched: '2023-01-18', sizeM: 6, facts: ['Nicknamed “Amelia Earhart”.', 'Broadcasts the newer L1C civil signal, designed to work alongside Galileo.'] },
  { id: 'galileo-27', name: 'Galileo GSAT0223', norad: 49809, purpose: 'Navigation (Galileo)', launched: '2021-12-05', sizeM: 5, facts: ['Part of Europe’s Galileo navigation system.', 'Galileo satellites orbit at about 23,200 km in three orbital planes.'] },
  { id: 'galileo-28', name: 'Galileo GSAT0224', norad: 49810, purpose: 'Navigation (Galileo)', launched: '2021-12-05', sizeM: 5, facts: ['Launched from Kourou on a Soyuz alongside GSAT0223.', 'Galileo’s atomic clocks drift by about a second in three million years.'] },
  { id: 'iridium-106', name: 'Iridium 106', norad: 41917, purpose: 'Satellite phone network', launched: '2017-01-14', sizeM: 3, facts: ['One of 66 active Iridium NEXT satellites that together cover the whole planet.', 'Went up on the first Iridium NEXT Falcon 9 launch.'] },
  { id: 'tdrs-13', name: 'TDRS-13', norad: 42915, purpose: 'Data relay for NASA missions', launched: '2017-08-18', sizeM: 6, facts: ['Relays data from the ISS and Hubble to the ground.', 'Part of NASA’s Tracking and Data Relay Satellite fleet in geostationary orbit.'] },
]

export function satelliteRecords(): Body[] {
  return SATELLITES.map((s) => ({
    id: s.id,
    name: s.name,
    type: 'satellite',
    parent: 'earth',
    radiusKm: s.sizeM / 2000,
    distanceFromParentKm: 0,
    orbitalPeriodDays: Number.NaN,
    rotationPeriodHours: 0,
    axialTiltDeg: Number.NaN,
    meanTempC: Number.NaN,
    moonCount: Number.NaN,
    color: '#f472b6',
    facts: s.facts,
    mission: { launched: s.launched, description: s.purpose },
  }))
}
