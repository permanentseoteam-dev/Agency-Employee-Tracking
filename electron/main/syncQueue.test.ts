import { describe, expect, it, vi } from 'vitest'
import { backoffMs, classify, newId, SyncQueue, type QueuedSegment, type QueueDeps } from './syncQueue'

const err = (status: number, extra: { code?: string; hint?: string } = {}) =>
  Object.assign(new Error('Failed to create record.'), { status, ...extra })

const NOW = Date.parse('2026-10-14T05:00:00.000Z')
const seg = (minute: number) => ({
  user: 'u1',
  state: 'active' as const,
  started_at: new Date(NOW + minute * 60000).toISOString(),
  ended_at: new Date(NOW + (minute + 5) * 60000).toISOString()
})

function setup(create: (item: unknown) => Promise<unknown>, opts: Partial<QueueDeps> = {}) {
  let saved: QueuedSegment[] = []
  let now = NOW
  let signedIn = true
  const deps: QueueDeps = {
    storage: { load: () => [], save: (items) => (saved = items.map((i) => ({ ...i }))) },
    client: () => (signedIn ? { userId: 'u1', create } : null),
    verifySession: async () => true,
    onAuthLost: vi.fn(() => (signedIn = false)),
    log: { info: () => {}, warn: () => {} },
    now: () => now,
    ...opts
  }
  const q = new SyncQueue(deps)
  return {
    q,
    deps,
    saved: () => saved,
    advance: (ms: number) => (now += ms),
    signIn: () => (signedIn = true)
  }
}

describe('newId', () => {
  it('makes 15-character [a-z0-9] ids', () => {
    for (let i = 0; i < 50; i++) expect(newId()).toMatch(/^[a-z0-9]{15}$/)
  })
})

describe('classify', () => {
  it.each([
    [err(409, { code: '23505' }), 'synced'],
    [err(400, { code: 'P0001', hint: 'segment_rejected' }), 'rejected'],
    [err(400), 'check'],
    [err(403, { code: '42501' }), 'check'],
    [err(401), 'auth'],
    [err(0), 'retry'],
    [err(502), 'retry'],
    [err(429), 'retry'],
    [new Error('boom'), 'retry']
  ])('%#', (e, outcome) => expect(classify(e)).toBe(outcome))

  it('backs off exponentially up to 5 minutes', () => {
    expect(backoffMs(1)).toBe(5000)
    expect(backoffMs(2)).toBe(10000)
    expect(backoffMs(20)).toBe(300000)
  })
})

describe('SyncQueue', () => {
  it('stores first, then creates with the client-made id', async () => {
    const create = vi.fn(async (_item: unknown) => ({}))
    const t = setup(create)
    const item = t.q.add(seg(0))
    await t.q.flush()
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ id: item.id, user: 'u1', state: 'active' }))
    expect(create.mock.calls[0][0]).not.toHaveProperty('attempts')
    expect(t.q.pending()).toEqual([])
    expect(t.saved()).toEqual([])
  })

  it('keeps segments while offline and sends them in order after reconnect', async () => {
    let online = false
    const sent: string[] = []
    const t = setup(async (item) => {
      if (!online) throw err(0)
      sent.push((item as QueuedSegment).started_at)
    })
    t.q.add(seg(0))
    await t.q.flush()
    t.q.add(seg(5))
    await t.q.flush()
    expect(t.q.pending().length).toBe(2)
    expect(t.saved().length).toBe(2)

    online = true
    t.advance(60_000)
    await t.q.flush()
    expect(t.q.pending()).toEqual([])
    expect(sent).toEqual([seg(0).started_at, seg(5).started_at])
  })

  it('hands segments recorded under an old account id to the new one and sends them', async () => {
    const sent: QueuedSegment[] = []
    const t = setup(async (item) => void sent.push(item as QueuedSegment))
    t.q.add({ ...seg(0), user: 'oldpocketbaseid' })
    t.q.add({ ...seg(5), user: 'someoneelse0000' })
    await t.q.flush()
    expect(sent).toEqual([]) // nothing belongs to u1 yet

    expect(t.q.reassign('oldpocketbaseid', 'u1')).toBe(1)
    await t.q.flush()
    expect(sent.map((s) => [s.user, s.started_at])).toEqual([['u1', seg(0).started_at]])
    expect(t.q.pending().map((i) => i.user)).toEqual(['someoneelse0000']) // another person's time stays theirs
    expect(t.saved().map((i) => i.user)).toEqual(['someoneelse0000'])
  })

  it('counts a duplicate id as already synced', async () => {
    const t = setup(async () => {
      throw err(409, { code: '23505' })
    })
    t.q.add(seg(0))
    await t.q.flush()
    expect(t.q.pending()).toEqual([])
  })

  it('drops a segment the server rejects and carries on', async () => {
    const warn = vi.fn()
    const create = vi.fn(async (item: unknown) => {
      if ((item as QueuedSegment).started_at === seg(0).started_at) throw err(400, { hint: 'segment_rejected' })
    })
    const t = setup(create, { log: { info: () => {}, warn } })
    t.q.add(seg(0))
    t.q.add(seg(5))
    await t.q.flush()
    expect(t.q.pending()).toEqual([])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('rejected'))
  })

  it('keeps segments and pauses when the session has expired', async () => {
    let valid = false
    const t = setup(async () => {
      if (!valid) throw err(403, { code: '42501' }) // a permission rule refusing a dead session
    }, { verifySession: async () => valid })
    t.q.add(seg(0))
    await t.q.flush()
    expect(t.deps.onAuthLost).toHaveBeenCalledOnce()
    expect(t.q.pending().length).toBe(1)

    t.q.add(seg(5))
    await t.q.flush()
    expect(t.q.pending().length).toBe(2) // signed out: nothing is sent

    valid = true
    t.signIn()
    await t.q.flush()
    expect(t.q.pending()).toEqual([])
  })

  it('only sends the signed-in user’s segments', async () => {
    const create = vi.fn(async () => ({}))
    const t = setup(create)
    t.q.add({ ...seg(0), user: 'someone-else' })
    await t.q.flush()
    expect(create).not.toHaveBeenCalled()
    expect(t.q.pending('someone-else').length).toBe(1)
  })

  it('drops queued segments older than 30 days', async () => {
    const create = vi.fn(async () => ({}))
    const t = setup(create, { client: () => null })
    t.q.add(seg(0))
    await t.q.flush()
    expect(t.q.pending().length).toBe(1)
    t.advance(31 * 24 * 60 * 60_000)
    await t.q.flush()
    expect(t.q.pending()).toEqual([])
  })
})
