// The tracking state machine (plan §4.1). Pure: it gets the time, the system
// idle seconds and the rules on every poll, and returns the segments that just
// closed. engine.ts feeds it from powerMonitor and stores what it returns.
import { addDays, isoWeekday, toDateKey, zonedTimeToUtc } from '../../src/lib/dates'
import type { TrackerSettings } from '../preload/api'

export type TrackState = 'active' | 'idle'

export interface Segment {
  state: TrackState
  startedAt: number
  endedAt: number
}

export const POLL_MS = 15_000
/** Open segments are closed and a new one started at least this often. */
export const ROLL_MS = 5 * 60_000
/** Longer than this between polls (sleep without a suspend event, a frozen process): the gap is not counted. */
export const GAP_MS = 60_000
/** Shorter pieces are dropped; the server needs the end to be after the start. */
const MIN_SEGMENT_MS = 1000
/** The server's segment guard refuses a segment that ends more than this after its own clock. */
const SERVER_FUTURE_MS = 2 * 60_000

/** Today's shift as UTC instants, or null on a non-working day. */
export function shiftFor(now: number, rules: TrackerSettings): { start: number; end: number } | null {
  const tz = rules.timezone
  const day = toDateKey(now, tz)
  // Any time: the whole local day, every day (segments still split at midnight).
  if (rules.any_time) {
    return { start: zonedTimeToUtc(day, '00:00', tz).getTime(), end: zonedTimeToUtc(addDays(day, 1), '00:00', tz).getTime() }
  }
  if (!rules.work_days.includes(isoWeekday(day))) return null
  return {
    start: zonedTimeToUtc(day, rules.shift_start, tz).getTime(),
    end: zonedTimeToUtc(day, rules.shift_end, tz).getTime()
  }
}

export function inShift(now: number, rules: TrackerSettings): boolean {
  const shift = shiftFor(now, rules)
  return !!shift && now >= shift.start && now < shift.end
}

interface Open {
  state: TrackState
  startedAt: number
}

export class TrackerMachine {
  private open: Open | null = null
  private lastTick: number | null = null
  /** Latest moment input is known to have happened while active. Active time is only confirmed up to here. */
  private lastInput = 0
  /**
   * End of the last segment handed out. A new segment never starts before it: after the clock
   * moves back, a segment starting at the (earlier) new time would overlap one already recorded,
   * and the server's overlap guard would reject it and the time would be lost.
   */
  private lastEmittedEnd = 0

  /** The state of the open segment, or null when nothing is being tracked. */
  get state(): TrackState | null {
    return this.open?.state ?? null
  }

  /** Seconds of the open segment that count so far (active only up to the last input). */
  openSeconds(now: number): { state: TrackState; seconds: number } | null {
    if (!this.open) return null
    const end = this.open.state === 'active' ? Math.min(now, this.lastInput) : now
    return { state: this.open.state, seconds: Math.max(0, Math.floor((end - this.open.startedAt) / 1000)) }
  }

  /** One poll. Returns the segments that closed. */
  tick(now: number, idleSeconds: number, rules: TrackerSettings): Segment[] {
    const out: Segment[] = []
    if (this.lastTick !== null && this.open && (now - this.lastTick > GAP_MS || now < this.lastTick)) {
      // Missed polls or the clock moved back: keep what was seen and start over.
      this.emit(this.open.state, this.open.startedAt, this.lastTick, out)
      this.open = null
    }
    this.lastTick = now

    const shift = shiftFor(now, rules)
    const tracking = !!shift && now >= shift.start && now < shift.end
    if (this.open) {
      // A segment open past the end of the shift is cut at the shift end.
      const t = tracking || !shift ? now : Math.max(this.open.startedAt, Math.min(now, shift.end))
      this.advance(t, now - idleSeconds * 1000, rules, out)
      if (!tracking) this.close(t, out)
    } else if (tracking) {
      const idle = idleSeconds * 1000 >= thresholdMs(rules)
      // Never before what was already recorded (the clock moved back): until the clock catches
      // up, the open segment simply holds nothing. But the server refuses segments that end more
      // than SERVER_FUTURE_MS ahead of its clock, so after a big correction (the PC clock was hours
      // ahead) what was recorded further ahead never got in: don't wait for it.
      this.lastEmittedEnd = Math.min(this.lastEmittedEnd, now + SERVER_FUTURE_MS)
      const start = Math.max(now, this.lastEmittedEnd)
      this.open = { state: idle ? 'idle' : 'active', startedAt: start }
      this.lastInput = start
    }
    return out
  }

  /** Lock, suspend, sign-out or quit: close the open segment now. */
  stop(now: number, idleSeconds: number, rules: TrackerSettings): Segment[] {
    const out: Segment[] = []
    if (this.open) {
      const t = Math.max(this.open.startedAt, now)
      this.advance(t, now - idleSeconds * 1000, rules, out)
      this.close(t, out)
    }
    this.lastTick = null
    return out
  }

  private advance(t: number, rawLastInput: number, rules: TrackerSettings, out: Segment[]): void {
    const o = this.open!
    const lastInput = Math.min(rawLastInput, t)
    const idle = t - lastInput >= thresholdMs(rules)

    if (o.state === 'active') {
      if (idle) {
        // Backdate the switch to the last input, so the idle stretch never counts as active.
        const at = Math.max(o.startedAt, lastInput)
        this.emit('active', o.startedAt, at, out)
        this.open = { state: 'idle', startedAt: at }
        this.rollIdle(t, out)
      } else {
        this.lastInput = Math.max(this.lastInput, lastInput)
        if (this.lastInput - o.startedAt >= ROLL_MS) {
          this.emit('active', o.startedAt, this.lastInput, out)
          this.open = { state: 'active', startedAt: this.lastInput }
        }
      }
    } else if (!idle) {
      const at = Math.max(o.startedAt, lastInput)
      this.emit('idle', o.startedAt, at, out)
      this.open = { state: 'active', startedAt: at }
      this.lastInput = Math.max(at, lastInput)
    } else {
      this.rollIdle(t, out)
    }
  }

  private rollIdle(t: number, out: Segment[]): void {
    const o = this.open!
    if (t - o.startedAt >= ROLL_MS) {
      this.emit('idle', o.startedAt, t, out)
      this.open = { state: 'idle', startedAt: t }
    }
  }

  private close(t: number, out: Segment[]): void {
    if (this.open) this.emit(this.open.state, this.open.startedAt, t, out)
    this.open = null
  }

  /** Adds a closed segment, split so no piece is longer than ROLL_MS (the server allows 6 min). */
  private emit(state: TrackState, start: number, end: number, out: Segment[]): void {
    let s = Math.max(start, this.lastEmittedEnd)
    while (end - s > ROLL_MS) {
      out.push({ state, startedAt: s, endedAt: s + ROLL_MS })
      s += ROLL_MS
    }
    if (end - s >= MIN_SEGMENT_MS) out.push({ state, startedAt: s, endedAt: end })
    const last = out[out.length - 1]
    if (last) this.lastEmittedEnd = Math.max(this.lastEmittedEnd, last.endedAt)
  }
}

function thresholdMs(rules: TrackerSettings): number {
  return Math.max(1, rules.idle_threshold_minutes) * 60_000
}
