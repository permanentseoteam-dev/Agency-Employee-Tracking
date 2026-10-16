import { useEffect, useState } from 'react'
import { Database, FolderOpen, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import { useSession } from '@/stores/session'
import { useTheme, type Theme } from '@/stores/theme'
import { DATABASE_LIMIT_BYTES, useDatabaseSize } from './api'

type Autostart = Awaited<ReturnType<Window['tracker']['getAutostart']>>

export function Settings() {
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.setTheme)
  const [autostart, setAutostart] = useState<Autostart | null>(null)

  useEffect(() => {
    void window.tracker.getAutostart().then(setAutostart)
  }, [])

  const themes: { value: Theme; label: string; Icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', Icon: Sun },
    { value: 'dark', label: 'Dark', Icon: Moon }
  ]

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-md border border-slate-300 p-1 dark:border-slate-700">
            {themes.map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={theme === value}
                onClick={() => setTheme(value)}
                className={cn(
                  'flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium',
                  theme === value
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                )}
              >
                <Icon className="size-4" aria-hidden /> {label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Startup</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-indigo-600"
              disabled={!autostart?.supported || autostart.locked}
              checked={autostart?.enabled ?? false}
              onChange={(e) => void window.tracker.setAutostart(e.target.checked).then(setAutostart)}
            />
            <span>
              <span className="font-medium">Start PSEO Tracker when Windows starts</span>
              <span className="block text-slate-500">
                {autostart && !autostart.supported
                  ? 'Available in the installed app only.'
                  : autostart?.locked
                    ? 'Always on for employees, so your working time is recorded from the moment you log in.'
                    : 'Recommended, so your working time is recorded from the moment you log in.'}
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Troubleshooting</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4 text-sm">
          <p className="text-slate-500">If something goes wrong, send the log file to your admin.</p>
          <Button variant="secondary" size="sm" onClick={() => void window.tracker.openLogsFolder()}>
            <FolderOpen className="size-4" aria-hidden /> Open logs folder
          </Button>
        </CardContent>
      </Card>

      <DatabaseUsage />
    </div>
  )
}

/** Admins: how full the database is (the free plan allows 500 MB). */
function DatabaseUsage() {
  const isAdmin = useSession((s) => s.user?.role === 'admin')
  const { data: bytes } = useDatabaseSize(isAdmin)
  if (!isAdmin || bytes == null) return null
  const mb = bytes / (1024 * 1024)
  const share = Math.min(1, bytes / DATABASE_LIMIT_BYTES)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Database</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="flex items-center gap-2">
          <Database className="size-4 text-slate-500" aria-hidden />
          <span>
            <span className="font-medium">{mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB</span> of 500 MB used ({Math.round(share * 100)}%)
          </span>
        </p>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" role="progressbar" aria-valuenow={Math.round(share * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Database used">
          <div className={cn('h-full rounded-full', share > 0.8 ? 'bg-red-500' : share > 0.6 ? 'bg-amber-500' : 'bg-indigo-600')} style={{ width: `${Math.max(share * 100, 1)}%` }} />
        </div>
        <p className="text-slate-500">The free plan allows 500 MB. Only admins see this.</p>
      </CardContent>
    </Card>
  )
}
