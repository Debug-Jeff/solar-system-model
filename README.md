# Solar System Model

An interactive 3D model of the solar system built with Three.js, with a small Go backend that serves NASA imagery.

- Planets, major moons, dwarf planets and comets on Keplerian orbits
- Compressed "visual" scale or true scale
- Asteroid and Kuiper belts
- NASA Astronomy Picture of the Day, the latest DSCOVR EPIC photo of Earth, and a live satellite Earth texture

## Running locally

Requirements: Go 1.26+, Node 20.19+ (or 22.12+).

```sh
cd backend
cp .env.example .env   # optional, add your NASA_API_KEY
go run .

cd frontend
npm ci
npm run dev
```

Open http://localhost:5173. On Windows, `./start.ps1` starts both.

## Tests

```sh
cd backend && go test ./...
cd frontend && npm test
```
