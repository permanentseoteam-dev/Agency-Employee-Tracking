import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Table, Td, Th } from '@/components/ui/Table'
import { useLeaveTypes, useOrgSettings } from '@/features/rules/api'
import { toDateKey, DEFAULT_TZ } from '@/lib/dates'
import type { LeaveBalance } from '@/lib/leave'
import { useLeaveBalances, useLeaveLive } from './api'

type BalanceRow = LeaveBalance & { expand?: { user?: { id: string; full_name: string } } }

/** This year's balances for everyone I can see (my teams, or everyone for an admin), from the leave_balances view. */
export function TeamBalances() {
  const settings = useOrgSettings()
  const year = toDateKey(Date.now(), settings.data?.timezone || DEFAULT_TZ).slice(0, 4)
  const types = useLeaveTypes()
  const balances = useLeaveBalances()
  useLeaveLive()
  const [search, setSearch] = useState('')

  const people = useMemo(() => {
    const byUser = new Map<string, { name: string; cells: Map<string, BalanceRow> }>()
    for (const b of (balances.data ?? []) as BalanceRow[]) {
      const person = byUser.get(b.user) ?? { name: b.expand?.user?.full_name ?? '—', cells: new Map() }
      person.cells.set(b.leave_type, b)
      byUser.set(b.user, person)
    }
    const q = search.trim().toLowerCase()
    return [...byUser.entries()]
      .map(([id, p]) => ({ id, ...p }))
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [balances.data, search])
  const typeList = types.data ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Balances {year}</h2>
        <Input
          aria-label="Search people"
          placeholder="Search by name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto h-9 w-56 max-w-full"
        />
      </div>
      <Card>
        {balances.isLoading || types.isLoading ? (
          <p className="p-6 text-sm text-slate-500">Loading…</p>
        ) : balances.isError ? (
          <p className="p-6 text-sm text-red-600">Could not load the balances.</p>
        ) : people.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">{search ? 'Nobody matches the search.' : 'No one to show.'}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Who</Th>
                {typeList.map((t) => (
                  <Th key={t.id} className="text-right">
                    {t.name}
                    {t.paid ? '' : ' (unpaid)'}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} data-person={p.name}>
                  <Td className="font-medium">{p.name}</Td>
                  {typeList.map((t) => {
                    const cell = p.cells.get(t.id)
                    if (!cell) return <Td key={t.id} className="text-right text-slate-400">—</Td>
                    return (
                      <Td key={t.id} className="text-right tabular-nums" data-type={t.name} data-left={t.paid ? cell.remaining : ''}>
                        {t.paid ? (
                          <>
                            <span className={cell.remaining <= 0 ? 'font-semibold text-red-600' : 'font-semibold'}>{cell.remaining}</span>
                            <span className="text-slate-500"> of {cell.quota}</span>
                            <span className="block text-xs text-slate-500">{cell.used} used</span>
                          </>
                        ) : (
                          <span>{cell.used} taken</span>
                        )}
                      </Td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <p className="text-xs text-slate-500">
        Days left = the yearly quota minus approved days this year. Pending requests are not taken off until they are approved.
        Unpaid leave has no quota, so only the days taken are shown.
      </p>
    </div>
  )
}
