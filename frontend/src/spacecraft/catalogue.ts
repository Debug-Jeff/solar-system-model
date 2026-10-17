import type { Body } from '../types/body'

export interface SpacecraftInfo {
  id: string
  name: string
  parent: 'sun' | 'earth' | 'mars' | 'jupiter'
  distanceFromParentKm: number
  periodDays?: number
  launched: string
  mission: string
  facts: string[]
}

export const SPACECRAFT: SpacecraftInfo[] = [
  {
    id: 'parker',
    name: 'Parker Solar Probe',
    parent: 'sun',
    distanceFromParentKm: 0,
    launched: '2018-08-12',
    mission: 'Fly through the Sun’s outer corona',
    facts: ['The closest any spacecraft has come to the Sun, passing about 6 million km from its surface.', 'At closest approach it moves at roughly 190 km/s, the fastest of any human-made object.'],
  },
  {
    id: 'europa-clipper',
    name: 'Europa Clipper',
    parent: 'sun',
    distanceFromParentKm: 0,
    launched: '2024-10-14',
    mission: 'Study Jupiter’s ocean moon Europa',
    facts: ['NASA’s largest planetary spacecraft, with solar arrays spanning about 30 m.', 'Due to reach Jupiter in 2030 after gravity assists from Mars and Earth.'],
  },
  {
    id: 'lucy',
    name: 'Lucy',
    parent: 'sun',
    distanceFromParentKm: 0,
    launched: '2021-10-16',
    mission: 'Tour the Trojan asteroids that share Jupiter’s orbit',
    facts: ['Flew past the main-belt asteroids Dinkinesh (2023) and Donaldjohanson (2025).', 'Will visit more asteroids than any mission before it.'],
  },
  {
    id: 'psyche-probe',
    name: 'Psyche spacecraft',
    parent: 'sun',
    distanceFromParentKm: 0,
    launched: '2023-10-13',
    mission: 'Orbit the metal-rich asteroid 16 Psyche',
    facts: ['Uses Hall-effect electric thrusters for most of its cruise.', 'Due to arrive at Psyche in 2029.'],
  },
  {
    id: 'voyager-1',
    name: 'Voyager 1',
    parent: 'sun',
    distanceFromParentKm: 0,
    launched: '1977-09-05',
    mission: 'Grand tour of Jupiter and Saturn, now interstellar',
    facts: ['The most distant human-made object.', 'Crossed into interstellar space in 2012.'],
  },
  {
    id: 'voyager-2',
    name: 'Voyager 2',
    parent: 'sun',
    distanceFromParentKm: 0,
    launched: '1977-08-20',
    mission: 'Grand tour of the outer planets, now interstellar',
    facts: ['The only spacecraft to have visited Uranus and Neptune.', 'Crossed into interstellar space in 2018.'],
  },
  {
    id: 'new-horizons',
    name: 'New Horizons',
    parent: 'sun',
    distanceFromParentKm: 0,
    launched: '2006-01-19',
    mission: 'Explore Pluto and the Kuiper belt',
    facts: ['First spacecraft to fly past Pluto, in July 2015.', 'Flew past the Kuiper belt object Arrokoth in January 2019.'],
  },
  {
    id: 'osiris-apex',
    name: 'OSIRIS-APEX',
    parent: 'sun',
    distanceFromParentKm: 0,
    launched: '2016-09-08',
    mission: 'Rendezvous with asteroid Apophis',
    facts: ['Launched as OSIRIS-REx, it returned a sample of asteroid Bennu to Earth in 2023.', 'Due to reach Apophis in 2029, just after its close pass by Earth.'],
  },
  {
    id: 'solar-orbiter',
    name: 'Solar Orbiter',
    parent: 'sun',
    distanceFromParentKm: 0,
    launched: '2020-02-10',
    mission: 'Image the Sun up close, including its poles',
    facts: ['An ESA mission with NASA participation.', 'Its orbit is being tilted step by step to view the Sun’s polar regions.'],
  },
  {
    id: 'bepicolombo',
    name: 'BepiColombo',
    parent: 'sun',
    distanceFromParentKm: 0,
    launched: '2018-10-20',
    mission: 'Two orbiters for Mercury (ESA and JAXA)',
    facts: ['Has flown past Earth once, Venus twice and Mercury six times on its way in.', 'Carries two separate orbiters that will split up at Mercury.'],
  },
  {
    id: 'juice',
    name: 'JUICE',
    parent: 'sun',
    distanceFromParentKm: 0,
    launched: '2023-04-14',
    mission: 'Explore Jupiter’s icy moons, ending in orbit around Ganymede',
    facts: ['An ESA mission due to reach Jupiter in 2031.', 'Made the first-ever combined Moon–Earth flyby in August 2024.'],
  },
  {
    id: 'hera',
    name: 'Hera',
    parent: 'sun',
    distanceFromParentKm: 0,
    launched: '2024-10-07',
    mission: 'Survey the Didymos–Dimorphos pair after NASA’s DART impact',
    facts: ['An ESA planetary-defence mission.', 'DART deliberately struck Dimorphos in 2022 and changed its orbit.'],
  },
  {
    id: 'jwst',
    name: 'James Webb Space Telescope',
    parent: 'earth',
    distanceFromParentKm: 1_500_000,
    launched: '2021-12-25',
    mission: 'Infrared space observatory',
    facts: ['Orbits the Sun–Earth L2 point, about 1.5 million km from Earth.', 'Its 6.5 m gold-coated mirror is made of 18 hexagonal segments.'],
  },
  {
    id: 'mro',
    name: 'Mars Reconnaissance Orbiter',
    parent: 'mars',
    distanceFromParentKm: 3700,
    periodDays: 0.0782,
    launched: '2005-08-12',
    mission: 'Map Mars in high resolution and relay rover data',
    facts: ['In orbit around Mars since 2006.', 'Its HiRISE camera can resolve objects about 1 m across on the surface.'],
  },
  {
    id: 'juno-probe',
    name: 'Juno',
    parent: 'jupiter',
    distanceFromParentKm: 4_500_000,
    periodDays: 33,
    launched: '2011-08-05',
    mission: 'Study Jupiter’s interior, magnetic field and poles',
    facts: ['In a highly elliptical polar orbit around Jupiter since July 2016.', 'Its extended mission has included close flybys of Ganymede, Europa and Io.'],
  },
]

export function spacecraftRecords(): Body[] {
  return SPACECRAFT.map((c) => ({
    id: c.id,
    name: c.name,
    type: 'spacecraft',
    parent: c.parent,
    radiusKm: 0.01,
    distanceFromParentKm: c.distanceFromParentKm,
    orbitalPeriodDays: c.periodDays ?? Number.NaN,
    rotationPeriodHours: 0,
    axialTiltDeg: Number.NaN,
    meanTempC: Number.NaN,
    moonCount: Number.NaN,
    color: '#4ade80',
    facts: c.facts,
    mission: { launched: c.launched, description: c.mission },
  }))
}
