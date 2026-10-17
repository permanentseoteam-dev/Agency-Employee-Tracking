import type { ReactNode } from 'react'
import logo from '@/assets/logo.png'
import { Card } from '@/components/ui/Card'

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    // The screen scrolls on its own when the form is taller than the window (minHeight 600).
    <div className="relative h-full overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute hidden dark:block -top-[120px] -left-[120px] size-[480px] rounded-full bg-[#5C84FF] opacity-35 blur-[110px] dark:opacity-15" />
      <div aria-hidden className="pointer-events-none absolute hidden dark:block -right-[100px] -bottom-[140px] size-[520px] rounded-full bg-[#2F5BFF] opacity-[.22] blur-[120px] dark:opacity-10" />
      <div className="relative h-full overflow-y-auto">
        <div className="flex min-h-full items-center justify-center px-4 py-10">
          <div className="w-full max-w-md">
            <div className="mb-6 flex items-center justify-center gap-2">
              <img src={logo} alt="" className="size-9 rounded-[11px]" />
              <span className="text-[19px] font-bold text-ink-900">PSEO Tracker</span>
            </div>
            <Card className="rounded-[var(--radius-shell)] p-7">
              <h1 className="text-[22px] font-bold tracking-[-.02em] wrap-break-word text-ink-900">{title}</h1>
              {subtitle && <p className="mt-1 text-sm wrap-break-word text-ink-500">{subtitle}</p>}
              <div className="mt-6">{children}</div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-[var(--radius-control)] bg-[var(--danger-bg)] px-3 py-2 text-sm wrap-break-word text-[var(--danger-text)]">
      {message}
    </p>
  )
}
