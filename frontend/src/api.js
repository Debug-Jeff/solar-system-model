// Thin wrappers around our Go backend's API. Requests are relative
// (/api/...) by default so they work through the Vite dev proxy; set
// VITE_API_BASE_URL when the backend is deployed separately from the
// frontend (e.g. frontend on Vercel, backend on Render/Fly.io).
export const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

async function getJSON(path) {
  const url = API_BASE + path
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`${url} responded ${res.status}`)
  }
  return res.json()
}

export function fetchPlanets() {
  return getJSON('/api/planets').then((data) => data.bodies)
}

export function fetchApod() {
  return getJSON('/api/apod')
}

// EPIC returns every natural-color capture from the most recent
// available day, oldest first. The last entry is the most recent photo.
export async function fetchLatestEpic() {
  const items = await getJSON('/api/epic')
  if (!items.length) throw new Error('no EPIC imagery available')
  const item = items[items.length - 1]
  // imageUrl comes back as a backend-relative path (e.g. /api/epic/image?...)
  // and is used directly as an <img src>, so it needs the same base the
  // frontend's other API calls use when the backend lives on another origin.
  return { ...item, imageUrl: API_BASE + item.imageUrl }
}
