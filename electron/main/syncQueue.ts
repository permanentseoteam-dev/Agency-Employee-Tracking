// Offline-safe delivery of activity segments (plan §4.1). Every closed segment
// is stored on disk first and then created in PocketBase with a client-made id,
// so a retry can never create a second copy (Supabase answers a repeat with 409).
import { randomInt } from 'node:crypto'

export interface QueuedSegment {
  id: string
  user: string
  state: 'active' | 'idle'
  started_at: string
  ended_at: string
  attempts: number
  /** Not retried before this time (ms). */
  next_at: number
}

export interface QueueStorage {
  load(): QueuedSegment[]
  save(items: QueuedSegment[]): void
}

export type Outcome = 'synced' | 'rejected' | 'auth' | 'retry' | 'check'

export interface QueueDeps {
  storage: QueueStorage
  /** The signed-in user and a create call, or null while signed out. */
  client(): { userId: string; create(item: Omit<QueuedSegment, 'attempts' | 'next_at'>): Promise<unknown> } | null
  /** Called on an unexplained 400/403 (a permission rule refuses a dead session that way). True = still signed in. */
  verifySession(): Promise<boolean>
  /** Called once when the server says the session is no longer valid. */
  onAuthLost(): void
  log: { info(...a: unknown[]): void; warn(...a: unknown[]): void }
  now?(): number
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
const BASE_DELAY_MS = 5_000
const MAX_DELAY_MS = 5 * 60_000
const MAX_AGE_MS = 30 * 24 * 60 * 60_000

/** A record id like the server's own: 15 characters of [a-z0-9]. */
export function newId(): string {
  let id = ''
  for (let i = 0; i < 15; i++) id += ALPHABET[randomInt(ALPHABET.length)]
  return id
}

/**
 * What to do with a segment after a failed create (a Supabase error: status, Postgres code, hint).
 * - the id is taken (23505 / 409): an earlier attempt got through
 * - the guard trigger refused it (hint segment_rejected): drop it
 * - 401: the session is dead; 400 / 403 (a permission rule refused it): check the session first
 */
export function classify(err: unknown): Outcome {
  const e = err as { status?: number; code?: string; hint?: string }
  const status = e?.status ?? 0
  if (e?.code === '23505' || status === 409) return 'synced'
  if (e?.hint === 'segment_rejected') return 'rejected'
  if (status === 401) return 'auth'
  if (status === 400 || status === 403) return 'check'
  return 'retry' // offline (0), server errors, rate limits
}

export function backoffMs(attempts: number): number {
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1))
}

export class SyncQueue {
  private items: QueuedSegment[]
  private flushing: Promise<void> | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private listeners = new Set<() => void>()

  constructor(private deps: QueueDeps) {
    this.items = deps.storage.load()
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  /** Segments waiting to be synced (optionally for one user). */
  pending(userId?: string): QueuedSegment[] {
    return userId ? this.items.filter((i) => i.user === userId) : [...this.items]
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  add(segment: Omit<QueuedSegment, 'id' | 'attempts' | 'next_at'>): QueuedSegment {
    const item: QueuedSegment = { id: newId(), ...segment, attempts: 0, next_at: 0 }
    this.items.push(item)
    this.persist()
    void this.flush()
    return item
  }

  /** Sends everything that is due. Concurrent calls share one run. */
  flush(): Promise<void> {
    if (!this.flushing) {
      this.flushing = this.run().finally(() => {
        this.flushing = null
        this.schedule()
      })
    }
    return this.flushing
  }

  private async run(): Promise<void> {
    this.prune()
    for (;;) {
      const client = this.deps.client()
      if (!client) return
      const now = this.now()
      const item = this.items.find((i) => i.user === client.userId && i.next_at <= now)
      if (!item) return

      let outcome: Outcome = 'synced'
      try {
        const { attempts: _a, next_at: _n, ...body } = item
        await client.create(body)
      } catch (err) {
        outcome = classify(err)
        if (outcome === 'check') outcome = (await this.deps.verifySession()) ? 'rejected' : 'auth'
        const message = (err as { message?: string })?.message ?? String(err)
        if (outcome === 'rejected') this.deps.log.warn(`segment ${item.id} (${item.started_at} – ${item.ended_at}) rejected: ${message}`)
        else if (outcome === 'synced') this.deps.log.info(`segment ${item.id} was already synced`)
      }

      if (outcome === 'auth') {
        this.deps.log.warn('sync paused: the session is no longer valid')
        this.deps.onAuthLost()
        return
      }
      if (outcome === 'retry') {
        item.attempts += 1
        item.next_at = now + backoffMs(item.attempts)
        this.persist()
        // Offline or the server is down: everything else would fail the same way.
        if (item.attempts === 1 || item.attempts % 5 === 0) {
          this.deps.log.info(`sync failed, retrying in ${Math.round(backoffMs(item.attempts) / 1000)} s (${this.items.length} queued)`)
        }
        return
      }
      this.items = this.items.filter((i) => i !== item)
      this.persist()
    }
  }

  /** Hands the queued segments of one account id to another (the PocketBase → Supabase switch). */
  reassign(from: string, to: string): number {
    let moved = 0
    for (const item of this.items) {
      if (item.user !== from) continue
      item.user = to
      item.next_at = 0
      moved++
    }
    if (moved) {
      this.persist()
      void this.flush()
    }
    return moved
  }

  /** The server rejects anything older than 30 days, so don't keep it. */
  private prune(): void {
    const cutoff = this.now() - MAX_AGE_MS
    const keep = this.items.filter((i) => Date.parse(i.started_at) >= cutoff)
    if (keep.length !== this.items.length) {
      this.deps.log.warn(`dropped ${this.items.length - keep.length} queued segment(s) older than 30 days`)
      this.items = keep
      this.persist()
    }
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const client = this.deps.client()
    const next = this.items.filter((i) => !client || i.user === client.userId).map((i) => i.next_at)
    if (!client || next.length === 0) return
    const delay = Math.max(1000, Math.min(...next) - this.now())
    this.timer = setTimeout(() => void this.flush(), delay)
    this.timer.unref?.()
  }

  private persist(): void {
    this.deps.storage.save(this.items)
    for (const fn of this.listeners) fn()
  }
}
