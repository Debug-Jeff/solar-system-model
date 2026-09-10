// Thin wrappers around our Go backend's API. All requests are relative
// (/api/...) so they work both through the Vite dev proxy and once built
// and served behind the same origin as the backend.

async function getJSON(url) {
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
  return items[items.length - 1]
}
