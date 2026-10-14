/** Formats a duration in seconds as `Xh Ym`, e.g. 19380 → "5h 23m". Seconds are dropped. */
export function formatDuration(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0
  const totalMinutes = Math.floor(safe / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}h ${minutes}m`
}
