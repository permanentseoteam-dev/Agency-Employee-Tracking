import { describe, expect, it } from 'vitest'
import type { TrackerSettings } from '../preload/api'
import { inShift, POLL_MS, ROLL_MS, shiftFor, TrackerMachine, type Segment } from './tracker'

const RULES: TrackerSettings = {
  shift_start: '09:00',
  shift_end: '18:00',
  work_days: [1, 2, 3, 4, 5],
  idle_threshold_minutes: 5,
  timezone: 'Asia/Karachi'
}
const MIN = 60_000
/** Wednesday 14 Oct 2026, 10:00 in Karachi. */
const T0 = Date.parse('2026-10-14T05:00:00.000Z')

/**
 * Polls every 15 s from `from` to `to`. `idleAt(t)` gives the system idle seconds at t.
 * Returns every segment that closed.
 */
function run(m: TrackerMachine, from: number, to: number, idleAt: (t: number) => number, rules = RULES): Segment[] {
  const out: Segment[] = []
  for (let t = from; t <= to; t += POLL_MS) out.push(...m.tick(t, idleAt(t), rules))
  return out
}
const busy = () => 0
const total = (segs: Segment[], state: 'active' | 'idle') =>
  segs.filter((s) => s.state === state).reduce((sum, s) => sum + (s.endedAt - s.startedAt), 0)

function expectContiguous(segs: Segment[]) {
  for (let i = 1; i < segs.length; i++) expect(segs[i].startedAt).toBe(segs[i - 1].endedAt)
}

describe('shift window', () => {
  it('uses the org timezone and working days', () => {
    const shift = shiftFor(T0, RULES)!
    expect(new Date(shift.start).toISOString()).toBe('2026-10-14T04:00:00.000Z')
    expect(new Date(shift.end).toISOString()).toBe('2026-10-14T13:00:00.000Z')
    expect(inShift(T0, RULES)).toBe(true)
    expect(inShift(Date.parse('2026-10-14T13:00:00.000Z'), RULES)).toBe(false)
    expect(shiftFor(Date.parse('2026-10-17T05:00:00.000Z'), RULES)).toBeNull() // Saturday
  })
})

describe('TrackerMachine', () => {
  it('opens an active segment on the first poll in shift', () => {
    const m = new TrackerMachine()
    expect(m.tick(T0, 0, RULES)).toEqual([])
    expect(m.state).toBe('active')
  })

  it('rolls active segments every 5 minutes with no gaps', () => {
    const m = new TrackerMachine()
    const segs = run(m, T0, T0 + 20 * MIN, busy)
    expect(segs.length).toBe(4)
    expect(segs.every((s) => s.state === 'active')).toBe(true)
    expect(segs.every((s) => s.endedAt - s.startedAt <= ROLL_MS + POLL_MS)).toBe(true)
    expectContiguous(segs)
    expect(segs[0].startedAt).toBe(T0)
  })

  it('backdates the switch to idle to the last input', () => {
    const m = new TrackerMachine()
    const lastInput = T0 + 2 * MIN
    const idleAt = (t: number) => (t <= lastInput ? 0 : Math.floor((t - lastInput) / 1000))
    const segs = run(m, T0, T0 + 12 * MIN, idleAt)
    expect(m.state).toBe('idle')
    // Active exactly until the last input, then idle from there: the inactive 5 min are not active time.
    expect(segs[0]).toEqual({ state: 'active', startedAt: T0, endedAt: lastInput })
    expect(segs[1].state).toBe('idle')
    expect(segs[1].startedAt).toBe(lastInput)
    expectContiguous(segs)
    expect(total(segs, 'active')).toBe(2 * MIN)
  })

  it('counts a short pause (under the threshold) as active', () => {
    const m = new TrackerMachine()
    const pause = { from: T0 + 1 * MIN, to: T0 + 4 * MIN }
    const idleAt = (t: number) => (t > pause.from && t < pause.to ? Math.floor((t - pause.from) / 1000) : 0)
    const segs = run(m, T0, T0 + 10 * MIN, idleAt)
    expect(total(segs, 'idle')).toBe(0)
    expect(m.state).toBe('active')
  })

  it('switches back to active when input returns', () => {
    const m = new TrackerMachine()
    const away = { from: T0 + 1 * MIN, to: T0 + 9 * MIN }
    const idleAt = (t: number) => (t > away.from && t < away.to ? Math.floor((t - away.from) / 1000) : 0)
    const segs = run(m, T0, T0 + 12 * MIN, idleAt)
    expect(m.state).toBe('active')
    expectContiguous(segs)
    // The whole away stretch is idle (8 min), split into pieces of at most 5 min.
    expect(total(segs, 'idle')).toBeGreaterThanOrEqual(8 * MIN - POLL_MS)
    expect(total(segs, 'idle')).toBeLessThanOrEqual(8 * MIN)
    expect(segs.every((s) => s.endedAt - s.startedAt <= 6 * MIN)).toBe(true)
  })

  it('splits a long backdated idle stretch into pieces the server accepts', () => {
    const m = new TrackerMachine()
    const rules = { ...RULES, idle_threshold_minutes: 30 }
    const idleAt = (t: number) => (t <= T0 + MIN ? 0 : Math.floor((t - T0 - MIN) / 1000))
    const segs = run(m, T0, T0 + 32 * MIN, idleAt, rules)
    expect(m.state).toBe('idle')
    expect(segs.every((s) => s.endedAt - s.startedAt <= ROLL_MS)).toBe(true)
    expect(total(segs, 'idle')).toBeGreaterThanOrEqual(30 * MIN)
    expectContiguous(segs)
  })

  it('closes the open segment on lock and tracks nothing until the next poll', () => {
    const m = new TrackerMachine()
    run(m, T0, T0 + 2 * MIN, busy)
    const segs = m.stop(T0 + 2 * MIN + 5000, 0, RULES)
    expect(segs).toEqual([{ state: 'active', startedAt: T0, endedAt: T0 + 2 * MIN + 5000 }])
    expect(m.state).toBeNull()
    // Unlocked 20 min later: a fresh segment, nothing for the locked time.
    const after = T0 + 22 * MIN
    expect(m.tick(after, 0, RULES)).toEqual([])
    expect(m.stop(after + MIN, 0, RULES)).toEqual([{ state: 'active', startedAt: after, endedAt: after + MIN }])
  })

  it('does not count a gap between polls (sleep without a suspend event)', () => {
    const m = new TrackerMachine()
    const segs = [...run(m, T0, T0 + MIN, busy), ...m.tick(T0 + 40 * MIN, 0, RULES)]
    expect(segs).toEqual([{ state: 'active', startedAt: T0, endedAt: T0 + MIN }])
    expect(m.state).toBe('active')
  })

  it('never starts a segment before one already recorded when the clock moves back', () => {
    const m = new TrackerMachine()
    // Tracked 4 min, then the PC clock jumps back 2 min and polling carries on from there.
    const first = run(m, T0, T0 + 4 * MIN, busy)
    const back = T0 + 4 * MIN - 2 * MIN
    const segs = [...first, ...run(m, back, back + 15 * MIN, busy), ...m.stop(back + 15 * MIN, 0, RULES)]
    expect(segs[0]).toEqual({ state: 'active', startedAt: T0, endedAt: T0 + 4 * MIN })
    // No piece overlaps an earlier one (the server would reject it and the time would be lost).
    for (let i = 1; i < segs.length; i++) expect(segs[i].startedAt).toBeGreaterThanOrEqual(segs[i - 1].endedAt)
    // Recording resumes where it left off: the next piece starts exactly at the end of the last one.
    expect(segs[1].startedAt).toBe(T0 + 4 * MIN)
    expect(segs.at(-1)!.endedAt).toBe(back + 15 * MIN)
    // While the clock catches up, the open segment holds nothing.
    const m2 = new TrackerMachine()
    run(m2, T0, T0 + 4 * MIN, busy)
    m2.tick(back, 0, RULES)
    expect(m2.openSeconds(back)).toEqual({ state: 'active', seconds: 0 })
  })

  it('also starts after the last recorded segment when the clock moved back while locked', () => {
    const m = new TrackerMachine()
    run(m, T0, T0 + 4 * MIN, busy)
    expect(m.stop(T0 + 4 * MIN, 0, RULES)).toEqual([{ state: 'active', startedAt: T0, endedAt: T0 + 4 * MIN }])
    const back = T0 + 2 * MIN
    run(m, back, back + 6 * MIN, busy)
    const segs = m.stop(back + 6 * MIN, 0, RULES)
    expect(segs).toEqual([{ state: 'active', startedAt: T0 + 4 * MIN, endedAt: back + 6 * MIN }])
  })

  it('does not wait for time recorded far ahead when a clock that was hours fast is corrected', () => {
    // The server refused everything that ended more than 2 min after its own clock, so nothing
    // recorded further ahead can overlap: recording resumes at most 2 min after the corrected time.
    const m = new TrackerMachine()
    const fast = T0 + 3 * 60 * MIN
    run(m, fast, fast + 4 * MIN, busy)
    m.stop(fast + 4 * MIN, 0, RULES)
    const segs = [...run(m, T0, T0 + 20 * MIN, busy), ...m.stop(T0 + 20 * MIN, 0, RULES)]
    expect(segs[0].startedAt).toBe(T0 + 2 * MIN)
    expectContiguous(segs)
    expect(segs.at(-1)!.endedAt).toBe(T0 + 20 * MIN)
    expect(total(segs, 'active')).toBe(18 * MIN)
  })

  it('does not track outside shift hours or on non-working days', () => {
    const m = new TrackerMachine()
    const before = Date.parse('2026-10-14T03:30:00.000Z') // 08:30 PKT
    expect(run(m, before, before + 20 * MIN, busy)).toEqual([])
    expect(m.state).toBeNull()
    const saturday = Date.parse('2026-10-17T05:00:00.000Z')
    expect(run(m, saturday, saturday + 20 * MIN, busy)).toEqual([])
    expect(m.state).toBeNull()
  })

  it('starts at the shift start and cuts the last segment at the shift end', () => {
    const m = new TrackerMachine()
    const start = Date.parse('2026-10-14T03:59:00.000Z') // 08:59
    const segs = run(m, start, start + 2 * MIN, busy)
    expect(segs).toEqual([])
    expect(m.state).toBe('active')

    const m2 = new TrackerMachine()
    const late = Date.parse('2026-10-14T12:57:00.000Z') // 17:57
    const end = Date.parse('2026-10-14T13:00:00.000Z')
    const out = run(m2, late, late + 6 * MIN, busy)
    expect(out.at(-1)!.endedAt).toBe(end)
    expect(m2.state).toBeNull()
    expect(out.every((s) => s.endedAt <= end)).toBe(true)
  })

  it('reports the open segment so far', () => {
    const m = new TrackerMachine()
    run(m, T0, T0 + 2 * MIN, busy)
    expect(m.openSeconds(T0 + 2 * MIN)).toEqual({ state: 'active', seconds: 120 })
  })
})
