// Pure helpers for the notification bell (plan §4.9). The server stores facts in
// `payload`; the wording lives here so it can change without touching old records.
import { addDays, formatDate, toDateKey, DEFAULT_TZ } from './dates'

export interface LeavePayload {
  request: string
  requester: string
  requester_name: string
  leave_type_name: string
  start_date: string
  end_date: string
  half_day: boolean
  days: number
  status?: string
  decided_by_name?: string
  comment?: string
}

/** Someone used "Create an account" on the sign-in page (register.pb.js). */
export interface RegisteredPayload {
  user: string
  name: string
  email: string
}

/** An admin gave stars by hand (stars.pb.js); the stars are the rule's at that moment. */
export interface StarsPayload {
  record: string
  rule_name: string
  stars: number
  date: string
  note: string
  given_by_name: string
}

export interface NotificationRecord {
  id: string
  user: string
  type: string
  payload: LeavePayload | RegisteredPayload | StarsPayload | null
  read_at: string
  created: string
}

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function parts(dateKey: string) {
  const [y, m, d] = dateKey.split('-').map(Number)
  return { y, m: MONTH[m - 1], d }
}

/** "20 Oct 2026", "20–22 Oct 2026", "30 Oct – 2 Nov 2026" or "30 Dec 2026 – 2 Jan 2027". */
export function dateRange(start: string, end: string): string {
  const a = parts(start)
  if (!end || end === start) return `${a.d} ${a.m} ${a.y}`
  const b = parts(end)
  if (a.y !== b.y) return `${a.d} ${a.m} ${a.y} – ${b.d} ${b.m} ${b.y}`
  if (a.m !== b.m) return `${a.d} ${a.m} – ${b.d} ${b.m} ${b.y}`
  return `${a.d}–${b.d} ${b.m} ${b.y}`
}

export function daysText(days: number, halfDay: boolean): string {
  if (halfDay || days === 0.5) return 'Half day'
  return `${days} day${days === 1 ? '' : 's'}`
}

/** The bell's two lines for a notification. */
export function notificationText(n: Pick<NotificationRecord, 'type' | 'payload'>): { title: string; detail: string } {
  if (!n.payload) return { title: 'Notification', detail: '' }
  if (n.type === 'signup_pending') {
    const r = n.payload as RegisteredPayload
    return { title: 'New sign-up waiting for approval', detail: [r.name, r.email, 'approve or reject it in Organization'].filter(Boolean).join(' · ') }
  }
  if (n.type === 'employee_registered') {
    const r = n.payload as RegisteredPayload
    return { title: 'New employee registered', detail: [r.name, r.email, 'set their team, role and salary'].filter(Boolean).join(' · ') }
  }
  if (n.type === 'stars_given') {
    const s = n.payload as StarsPayload
    const title = s.stars > 0 ? `You got ${s.stars} star${s.stars === 1 ? '' : 's'}` : 'A rule break was noted'
    return { title, detail: [s.rule_name, dateRange(s.date, s.date), s.note, s.given_by_name && `by ${s.given_by_name}`].filter(Boolean).join(' · ') }
  }
  const p = n.payload as LeavePayload
  const detail = [p.leave_type_name || 'Leave', dateRange(p.start_date, p.end_date), daysText(p.days, p.half_day)].join(' · ')
  if (n.type === 'leave_requested') {
    return { title: `${p.requester_name || 'Someone'} asked for leave`, detail }
  }
  if (n.type === 'leave_decided') {
    const outcome = p.status === 'approved' ? 'approved' : 'rejected'
    return { title: `Your leave was ${outcome}`, detail: p.decided_by_name ? `${detail} · by ${p.decided_by_name}` : detail }
  }
  return { title: 'Notification', detail: '' }
}

/** The approver's comment on a leave decision, shown in quotes under the text. */
export function notificationComment(n: Pick<NotificationRecord, 'payload'>): string {
  return n.payload && 'comment' in n.payload ? (n.payload.comment ?? '') : ''
}

/** Where clicking a notification goes. */
export function notificationLink(n: Pick<NotificationRecord, 'type'>): string | null {
  if (n.type === 'leave_requested') return '/approvals'
  if (n.type === 'leave_decided') return '/my-leaves'
  if (n.type === 'employee_registered' || n.type === 'signup_pending') return '/org/employees'
  if (n.type === 'stars_given') return '/my-attendance'
  return null
}

/** "just now", "5 min ago", "3 h ago", "yesterday", or the date. */
export function timeAgo(value: string, now: number, tz: string = DEFAULT_TZ): string {
  const t = Date.parse(value.replace(' ', 'T'))
  if (!Number.isFinite(t)) return ''
  const seconds = Math.max(0, (now - t) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  const today = toDateKey(now, tz)
  const day = toDateKey(t, tz)
  if (day === today) return `${Math.floor(seconds / 3600)} h ago`
  if (day === addDays(today, -1)) return 'yesterday'
  return formatDate(t, tz)
}
