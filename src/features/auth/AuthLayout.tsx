import type { ReactNode } from 'react'
import logo from '@/assets/logo.png'
import { Card } from '@/components/ui/Card'

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <img src={logo} alt="" className="size-8 rounded-lg" />
          <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">PSEO Tracker</span>
        </div>
        <Card className="p-6">
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </Card>
      </div>
    </div>
  )
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
      {message}
    </p>
  )
}
