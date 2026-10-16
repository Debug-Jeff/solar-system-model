# Solar System Model

An interactive 3D model of the solar system built with Three.js, backed by a small Go API that proxies NASA imagery (APOD, DSCOVR EPIC and GIBS satellite mosaics) and keeps the NASA API key server-side.

- Planets, major moons, dwarf planets and comets on Keplerian orbits
- Toggle between a compressed "visual" scale and true scale
- Asteroid and Kuiper belts with per-particle orbital periods
- NASA Astronomy Picture of the Day, the latest DSCOVR EPIC photo of Earth, and a live satellite Earth texture

## Layout

```
backend/    Go API (net/http, no framework)
frontend/   Vite + Three.js client
start.ps1   Starts both for local development on Windows
render.yaml Render blueprint for the backend
```

## Running locally

Requirements: Go 1.26+, Node 20.19+ (or 22.12+).

```sh
cd backend
cp .env.example .env   # optional, add NASA_API_KEY
go run .

cd frontend
npm ci
npm run dev
```

Open http://localhost:5173. The Vite dev server proxies `/api` to the backend on `:8080`.

On Windows, `./start.ps1` starts both in separate windows. It frees ports 8080 and 5173 first, but only if they are held by `go`, `node` or the backend binary.

## Configuration

Backend environment variables (a git-ignored `backend/.env` is also read):

| Variable | Default | Purpose |
| --- | --- | --- |
| `NASA_API_KEY` | `DEMO_KEY` | Key from https://api.nasa.gov. `DEMO_KEY` is heavily rate limited. |
| `PORT` | `8080` | Listen port. |
| `CLIENT_IP_HEADER` | unset | Header holding the real client IP when behind a proxy (e.g. `True-Client-IP`). Only set this if your proxy overwrites the header; otherwise clients can spoof it. When unset, the TCP peer address is used. |

Frontend build variable:

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | Backend origin when it is deployed separately, e.g. `https://solar-system-backend.onrender.com`. |

## API

| Route | Description | Cache-Control |
| --- | --- | --- |
| `GET /api/health` | Liveness check | `no-store` |
| `GET /api/planets` | Bundled body data | 1 hour |
| `GET /api/apod[?date=YYYY-MM-DD]` | Astronomy Picture of the Day | 30 min for today, immutable for past dates |
| `GET /api/epic` | Latest EPIC capture list, with `imageUrl` rewritten to the proxy | 30 min |
| `GET /api/epic/image?year&month&day&name` | One EPIC photo | immutable |
| `GET /api/gibs/earth-texture[?date=YYYY-MM-DD]` | 4096x2048 true-color Earth mosaic, walking back up to 5 days | 1 day |

## Abuse protection

- Every query parameter is validated against a strict format and a real date range before it reaches a cache key or an upstream URL.
- Per-client rate limit of 2 requests/second (burst 20), plus a global budget on upstream NASA calls so the API key's quota can't be drained.
- Concurrent requests for the same resource share one upstream fetch, and upstream failures are cached for 10 minutes.
- Server timeouts and a 32 MiB cap on upstream responses.
- Upstream errors are logged without the request query string, so the API key never lands in logs.

## Deployment

- Frontend: Vercel, with Root Directory set to `frontend` and `VITE_API_BASE_URL` pointing at the backend.
- Backend: Render via `render.yaml`. Render's free disk is ephemeral, so the on-disk cache is lost on every deploy or restart and refills from NASA on demand.

## Tests

```sh
cd backend && go test ./...
```

CI runs `gofmt`, `go vet`, `go test -race` and the frontend build on every push and pull request.
