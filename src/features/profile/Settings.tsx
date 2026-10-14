import { useEffect, useState } from 'react'
import { FolderOpen, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import { useTheme, type Theme } from '@/stores/theme'

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
              disabled={!autostart?.supported}
              checked={autostart?.enabled ?? false}
              onChange={(e) => void window.tracker.setAutostart(e.target.checked).then(setAutostart)}
            />
            <span>
              <span className="font-medium">Start Agency Tracker when Windows starts</span>
              <span className="block text-slate-500">
                {autostart && !autostart.supported
                  ? 'Available in the installed app only.'
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
    </div>
  )
}
