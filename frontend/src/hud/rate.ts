const LABELS = new Map<number, string>([
  [1, 'real rate'],
  [60, '1 min/s'],
  [3600, '1 hr/s'],
  [86_400, '1 day/s'],
  [604_800, '1 wk/s'],
  [2_629_800, '1 mo/s'],
  [31_557_600, '1 yr/s'],
])

export function formatRate(rate: number, paused: boolean): string {
  if (paused) return 'PAUSED'
  const label = LABELS.get(Math.abs(rate)) ?? `${Math.round(Math.abs(rate))}×`
  return rate < 0 ? `−${label}` : label
}
