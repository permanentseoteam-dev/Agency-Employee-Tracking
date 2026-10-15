/** Formats a duration in seconds as `Xh Ym`, e.g. 19380 → "5h 23m". Seconds are dropped. */
export function formatDuration(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0
  const totalMinutes = Math.floor(safe / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}h ${minutes}m`
}

/** Like formatDuration, with a leading "−" when negative, e.g. -780 → "−0h 13m". */
export function formatSignedDuration(totalSeconds: number): string {
  const s = Number.isFinite(totalSeconds) ? totalSeconds : 0
  return (s <= -60 ? '−' : '') + formatDuration(Math.abs(s))
}
