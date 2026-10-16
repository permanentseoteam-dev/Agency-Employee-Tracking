import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight, Undo2 } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'
import { Avatar } from '@/components/layout/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { FormError } from '@/features/auth/AuthLayout'
import { call, must, supabase, toUser, type UserRecord } from '@/lib/db'
import { loadHome, refreshHome, saveHome, switchTargets, viewingAs, type SessionTokens } from '@/lib/roleSwitch'
import { landingFor, roleOf, ROLE_LABEL } from '@/lib/roles'
import { currentTokens, errorMessage, useSession } from '@/stores/session'

/**
 * The signed-in role. An admin can switch role: view the app as any active person, with
 * no password (the org function's switch-to, admins only), and come back with "Back to me".
 * Time tracked on this PC keeps counting for the admin. Others only see their role.
 */
export function AccountSwitcher() {
  const user = useSession((s) => s.user)!
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const role = roleOf(user.role)
  const home = loadHome()
  const asSomeoneElse = viewingAs(home, user.id)

  /** Makes a session the app's session and goes to that role's landing page. */
  async function apply(tokens: SessionTokens, record: UserRecord) {
    // Close the old account's realtime connection; the remounted shell reconnects as the new one.
    await supabase.removeAllChannels()
    queryClient.clear()
    const { error: e } = await supabase.auth.setSession(tokens)
    if (e) throw e
    setOpen(false)
    navigate(landingFor(roleOf(record.role)))
  }

  async function switchTo(person: UserRecord) {
    setError(null)
    try {
      const home = loadHome()
      // The admin's own session: the saved one (renewed now) when viewing as someone else.
      const tokens = home ? await refreshHome() : currentTokens()
      if (!tokens) throw new Error('Sign in again to switch.')
      const me = { session: tokens, record: home?.record ?? user }
      if (person.id === me.record.id) return await apply(me.session, me.record)
      // Asked with the admin's own token, whoever is on screen right now.
      const res = await call<{ session: SessionTokens; record: Record<string, unknown> }>('org', { action: 'switch-to', userId: person.id }, me.session.access_token)
      saveHome(me)
      await apply(res.session, toUser(res.record))
    } catch (err) {
      setError(errorMessage(err, 'Could not switch.'))
    }
  }

  const canSwitch = role === 'admin' || asSomeoneElse
  return (
    <div className="flex items-center gap-2 text-sm">
      {asSomeoneElse ? (
        <span className="rounded-full bg-[var(--warning-bg)] px-3 py-1.5 font-semibold text-[var(--warning-text)]" data-role={role} data-viewing-as={user.email}>
          Viewing as {user.full_name || user.email} · {ROLE_LABEL[role]}
        </span>
      ) : (
        <span className="rounded-full bg-[var(--info-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--info-text)]" data-role={role}>
          {ROLE_LABEL[role]}
        </span>
      )}
      {asSomeoneElse && (
        <Button type="button" variant="secondary" onClick={() => void switchTo(home!.record)}>
          <Undo2 className="size-4" aria-hidden /> Back to me
        </Button>
      )}
      {canSwitch && (
        <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
          <ArrowLeftRight className="size-4" aria-hidden /> Switch role
        </Button>
      )}
      {error && !open && <span className="text-xs text-red-600">{error}</span>}
      {open && <SwitchRoleDialog currentId={user.id} error={error} onPick={switchTo} onClose={() => setOpen(false)} />}
    </div>
  )
}

function SwitchRoleDialog({
  currentId,
  error,
  onPick,
  onClose
}: {
  currentId: string
  error: string | null
  onPick: (person: UserRecord) => Promise<void>
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  // Listed with the admin's own sign-in: the person on screen may see fewer people.
  const people = useQuery({
    queryKey: ['switch-role', 'people'],
    queryFn: async () => {
      const home = loadHome()
      const tokens = home ? await refreshHome() : null
      const client = tokens
        ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
            auth: { persistSession: false, autoRefreshToken: false, storageKey: 'pseo.switch' },
            global: { headers: { Authorization: `Bearer ${tokens.access_token}` } }
          })
        : supabase
      const [people, emails] = await Promise.all([
        client.from('profiles').select('*').eq('active', true).order('full_name'),
        client.from('profile_emails').select('id, email')
      ])
      const emailOf = new Map(must(emails).map((r) => [r.id, r.email]))
      return must(people).map((p) => toUser(p, emailOf.get(p.id) ?? ''))
    }
  })
  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    return switchTargets(people.data ?? []).filter((p) => !q || `${p.full_name} ${p.email ?? ''}`.toLowerCase().includes(q))
  }, [people.data, search])

  return (
    <Dialog open onClose={onClose} title="Switch role" className="max-w-lg">
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          See the app exactly as this person does. No password needed. Time tracked on this PC still counts for you.
        </p>
        <Input aria-label="Search people" placeholder="Search by name or email" value={search} autoFocus onChange={(e) => setSearch(e.target.value)} />
        <FormError message={error} />
        <ul className="max-h-80 divide-y divide-slate-200 overflow-y-auto rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {people.isLoading && <li className="px-3 py-2 text-sm text-slate-500">Loading…</li>}
          {people.isError && <li className="px-3 py-2 text-sm text-red-600">{errorMessage(people.error, 'Could not load people.')}</li>}
          {list.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                data-switch-to={p.email}
                disabled={busy !== null || p.id === currentId}
                onClick={async () => {
                  setBusy(p.id)
                  await onPick(p)
                  setBusy(null)
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-800/50"
              >
                <Avatar user={p} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {p.full_name || p.email}
                    {p.id === currentId && <span className="font-normal text-slate-500"> · on screen now</span>}
                    {busy === p.id && <span className="font-normal text-slate-500"> · switching…</span>}
                  </span>
                  <span className="block truncate text-xs text-slate-500">{p.email}</span>
                </span>
                <Badge tone={p.role === 'admin' ? 'red' : p.role === 'manager' ? 'blue' : 'neutral'}>{ROLE_LABEL[roleOf(p.role)]}</Badge>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
