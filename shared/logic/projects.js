// Pure helpers for the Project tab. Plain CommonJS with no server globals, so Vitest
// tests the same file the Edge Functions bundle (scripts/build-edge-shared.mjs).
//
// A client's team page shows each person's status for one day:
// - a finished day: the stored attendance status (attendance.js decides it each night)
// - today: a live status from today's activity so far. Present and Late show as soon as
//   someone starts; with no activity it reads "Not in yet" until the shift ends, then
//   Absent. Too little active time gives stars, not a status.

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86400000
const MAX_RANGE_DAYS = 62
/** The statuses counted in a person's month totals, in display order. */
const COUNTED = ['present', 'late', 'half_day', 'absent', 'on_leave']

function isDateKey(value) {
  return typeof value === 'string' && DATE_KEY.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00.000Z'))
}

/** Milliseconds for a space-separated UTC date ("2026-10-14 05:00:00.000Z") or an ISO string; NaN if invalid. */
function parseInstant(value) {
  if (typeof value !== 'string' || !value) return NaN
  return Date.parse(value.trim().replace(' ', 'T'))
}

/** UTC milliseconds of a local "HH:mm" on a day, for a timezone offset in minutes. */
function localTime(day, hhmm, offsetMinutes) {
  const hm = String(hhmm || '00:00').split(':').map(Number)
  return Date.parse(day + 'T00:00:00.000Z') + ((hm[0] || 0) * 60 + (hm[1] || 0) - offsetMinutes) * 60000
}

/** The shift's start, the end of the grace period and the shift's end on a day. */
function shiftTimes(day, settings, offsetMinutes) {
  const s = settings || {}
  const start = localTime(day, s.shift_start || '09:00', offsetMinutes)
  return {
    shiftStart: start,
    graceEnd: start + (Number(s.grace_minutes) || 0) * 60000,
    shiftEnd: localTime(day, s.shift_end || '18:00', offsetMinutes)
  }
}

/**
 * Today's status while the day is still running.
 * base: attendance.statusFor() for today so far ({ status, active_s, first_activity_at }).
 * times: shiftTimes() for today, plus now (ms).
 */
function liveStatus(base, times) {
  const status = base && base.status
  if (status === 'holiday' || status === 'weekend' || status === 'on_leave') return status
  if (!base.active_s) return times.now >= times.shiftEnd ? 'absent' : 'not_in_yet'
  return status
}

/** Days of each counted status, from attendance records ({ status }). */
function monthCounts(records) {
  const out = {}
  for (const s of COUNTED) out[s] = 0
  for (const r of records || []) if (Object.prototype.hasOwnProperty.call(out, r.status)) out[r.status]++
  return out
}

/** Who may see a client and its team: admins, or people on a client that isn't archived. */
function canSee(client, auth) {
  if (!auth || !auth.id) return false
  if (auth.role === 'admin') return true
  return !client.archived && (client.members || []).indexOf(auth.id) !== -1
}

function clientOf(query) {
  const raw = query && query.client
  const client = typeof raw === 'string' ? raw.trim() : ''
  return client
}

/** GET /api/projects/status: { client, date? }. The date defaults to today and can't be later. */
function parseStatusQuery(query, today) {
  const client = clientOf(query)
  if (!client) return { error: 'Pick a client.' }
  const raw = query && typeof query.date === 'string' ? query.date.trim() : ''
  const date = raw || today
  if (!isDateKey(date)) return { error: 'Pick a valid date.' }
  if (date > today) return { error: 'Pick today or an earlier day.' }
  return { data: { client: client, date: date } }
}

/** GET /api/projects/leaves: { client, from, to }, at most MAX_RANGE_DAYS days. */
function parseLeaveQuery(query) {
  const client = clientOf(query)
  if (!client) return { error: 'Pick a client.' }
  const from = query && typeof query.from === 'string' ? query.from.trim() : ''
  const to = query && typeof query.to === 'string' ? query.to.trim() : ''
  if (!isDateKey(from) || !isDateKey(to)) return { error: 'Pick valid dates.' }
  if (to < from) return { error: 'The end date is before the start date.' }
  const days = (Date.parse(to + 'T00:00:00.000Z') - Date.parse(from + 'T00:00:00.000Z')) / DAY_MS + 1
  if (days > MAX_RANGE_DAYS) return { error: 'Pick at most ' + MAX_RANGE_DAYS + ' days.' }
  return { data: { client: client, from: from, to: to } }
}

/** A calendar event must end after it starts (these dates sort as text). */
function eventTimesProblem(startsAt, endsAt) {
  const start = parseInstant(startsAt)
  const end = parseInstant(endsAt)
  if (Number.isNaN(start) || Number.isNaN(end)) return 'Pick a start and an end.'
  if (end <= start) return 'An event has to end after it starts.'
  return null
}

module.exports = {
  COUNTED,
  MAX_RANGE_DAYS,
  shiftTimes,
  liveStatus,
  monthCounts,
  canSee,
  parseStatusQuery,
  parseLeaveQuery,
  eventTimesProblem
}
