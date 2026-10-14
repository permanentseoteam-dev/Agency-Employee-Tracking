import { useNavigate } from 'react-router-dom'
import { useRole } from '@/hooks/useRole'
import type { Role } from '@/lib/pb'
import { landingFor, ROLE_LABEL } from '@/lib/roles'

/** Shows the user's role and lets them view the app as a lower role. Hidden choices are never offered. */
export function RoleSwitcher() {
  const { role, options, select } = useRole()
  const navigate = useNavigate()

  if (options.length === 1) {
    return <span className="text-sm text-slate-500 dark:text-slate-400">{ROLE_LABEL[role]}</span>
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-slate-500 dark:text-slate-400">View as</span>
      <select
        aria-label="View as role"
        value={role}
        onChange={(e) => {
          const next = e.target.value as Role
          select(next)
          navigate(landingFor(next))
        }}
        className="h-8 rounded-md border border-slate-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
      >
        {options.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
    </label>
  )
}
