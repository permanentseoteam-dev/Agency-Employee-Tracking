// Pure checks for activity segments. Plain CommonJS with no server globals, so Vitest
// tests the same file the Edge Functions bundle (scripts/build-edge-shared.mjs).

const MINUTE = 60 * 1000
const MAX_LENGTH_MS = 6 * MINUTE // the tracker rolls segments every 5 min
const MAX_AHEAD_MS = 2 * MINUTE // a PC clock set forward
const MAX_AGE_MS = 30 * 24 * 60 * MINUTE

/** Milliseconds for a space-separated UTC date ("2026-10-14 05:00:00.000Z") or an ISO string; NaN if invalid. */
function parseInstant(value) {
  if (typeof value !== 'string' || !value) return NaN
  return Date.parse(value.trim().replace(' ', 'T'))
}

/**
 * Checks one segment against the server clock.
 * Returns null when it is acceptable, or the reason it is rejected.
 * The overlap check needs the database, so it lives in the hook.
 */
function validateSegment(startedAt, endedAt, nowMs) {
  const start = parseInstant(startedAt)
  const end = parseInstant(endedAt)
  if (isNaN(start) || isNaN(end)) return 'The segment needs a valid start and end time.'
  if (end <= start) return 'The segment must end after it starts.'
  if (end - start > MAX_LENGTH_MS) return 'The segment is longer than 6 minutes.'
  if (end > nowMs + MAX_AHEAD_MS) return 'The segment ends in the future (check the PC clock).'
  if (nowMs - start > MAX_AGE_MS) return 'The segment is more than 30 days old.'
  return null
}

module.exports = { parseInstant, validateSegment, MAX_LENGTH_MS, MAX_AHEAD_MS, MAX_AGE_MS }
