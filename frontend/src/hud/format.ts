import type { Body } from '../types/body'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatNumber(n: number, digits = 0, locale?: string): string {
  return n.toLocaleString(locale, { maximumFractionDigits: digits })
}

export function formatPeriod(days: number, locale?: string): string {
  if (days >= 365) return `${formatNumber(days / 365.25, 2, locale)} yr`
  return `${formatNumber(days, 2, locale)} days`
}

export function formatRotation(hours: number, locale?: string): string {
  const magnitude = Math.abs(hours)
  const label =
    magnitude >= 48 ? `${formatNumber(magnitude / 24, 2, locale)} days` : `${formatNumber(magnitude, 1, locale)} hr`
  return hours < 0 ? `${label} (retrograde)` : label
}

export function formatDistance(body: Body, locale?: string): string {
  if (body.type === 'star') return '—'
  if (body.type === 'moon') return `${formatNumber(body.distanceFromParentKm ?? 0, 0, locale)} km`
  return `${formatNumber(body.distanceFromSunAU ?? 0, 3, locale)} AU`
}

export function formatType(type: string): string {
  return type.replace(/([a-z])([A-Z])/g, '$1 $2')
}

export function formatSpeed(value: number): string {
  return `${Math.round(value * 10) / 10}×`
}

export function formatSimDate(ms: number): string {
  const date = new Date(ms)
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`
}

export function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}
