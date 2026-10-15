// Extras on top of seed.mjs for npm run test:env:
// - the "Emergency" leave type (unpaid, no limit), as an admin adds it in Rules → Leave types
// - dummy pay history: the three months before this one, finalized, so every role has
//   something under Finance. The figures go through the real formula
//   (server/pb_hooks/lib/payroll.js), so the breakdown dialog adds up.
// This month stays free for running payroll by hand (admin plan A-61).
import { createRequire } from 'node:module'

const payroll = createRequire(import.meta.url)('../../server/pb_hooks/lib/payroll.js')

const shiftMonth = (month, n) => {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}

// What happened in each month, by email and months back (1 = last month): days off and adjustments.
// Late days are left out: whether they cost pay is changing (stars), and they don't here.
const MONTHS = {
  'admin@test.local': { 2: { half: 1 } },
  'bilal@test.local': { 1: { absent: 1 }, 3: { half: 1 } },
  'sana@test.local': { 1: { absent: 1 }, 2: { adjustment: 10000, note: 'Eid bonus' } },
  'asma@test.local': { 1: { half: 1 }, 2: { adjustment: 10000, note: 'Eid bonus' }, 3: { absent: 1 } },
  'chand@test.local': { 1: { absent: 2, half: 1 }, 2: { unpaid: 1 }, 3: { adjustment: -15000, note: 'Salary advance' } },
  'faisal@test.local': { 1: { half: 2 }, 3: { unpaid: 2 } }
}

export async function seedExtras(api, info, { log = () => {} } = {}) {
  await api.create('leave_types', { name: 'Emergency', yearly_quota_days: 0, paid: false })
  log('Emergency leave type (unpaid)')

  const [settings] = await api.list('org_settings')
  const holidays = await api.list('holidays')
  const users = await api.list('users')
  const salaries = new Map((await api.list('salaries')).map((s) => [s.user, s.monthly_salary_pkr]))
  const current = info.today.slice(0, 7)

  for (let back = 3; back >= 1; back--) {
    const month = shiftMonth(current, -back)
    const workingDays = payroll.workingDays(month, settings.work_days, holidays)
    const run = await api.create('payroll_runs', { month, status: 'draft' })
    const lines = []
    for (const u of users) {
      const base = salaries.get(u.id)
      if (!base || !payroll.employedDuring(month, u)) continue
      const m = MONTHS[u.email]?.[back] ?? {}
      const pay = payroll.calculate({
        base,
        workingDays,
        absentDays: m.absent,
        unpaidLeaveDays: m.unpaid,
        halfDays: m.half,
        adjustment: m.adjustment
      })
      lines.push({
        run: run.id,
        user: u.id,
        base,
        working_days: workingDays,
        absent_days: m.absent ?? 0,
        unpaid_leave_days: m.unpaid ?? 0,
        half_days: m.half ?? 0,
        deductions: pay.deductions,
        adjustment_pkr: m.adjustment ?? 0,
        note: m.note ?? '',
        net: pay.net
      })
    }
    await api.batchCreate('payroll_items', lines)
    await api.update('payroll_runs', run.id, { status: 'finalized' })
    log(`payroll ${month}: ${lines.length} people, finalized`)
  }
}
