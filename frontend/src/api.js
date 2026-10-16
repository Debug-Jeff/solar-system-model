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

export async function fetchLatestEpic() {
  const items = await getJSON('/api/epic')
  if (!items.length) throw new Error('no EPIC imagery available')
  const item = items[items.length - 1]
  return { ...item, imageUrl: API_BASE + item.imageUrl }
}
