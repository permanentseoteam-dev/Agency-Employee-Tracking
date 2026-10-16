import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type StatTone = 'success' | 'warning' | 'orange' | 'danger' | 'info' | 'brand' | 'navy' | 'neutral'

const DOT: Record<StatTone, string> = {
  success: 'var(--success)',
  warning: 'var(--warning)',
  orange: 'var(--orange)',
  danger: 'var(--danger)',
  info: 'var(--info)',
  brand: 'var(--brand-500)',
  navy: 'var(--brand-800)',
  neutral: 'var(--ink-400)'
}

/** KPI card: label + status dot, big value, optional progress bar (0..1). */
export function StatCard({
  label,
  value,
  tone = 'brand',
  progress,
  valueProps,
  className,
  children
}: {
  label: string
  value: ReactNode
  tone?: StatTone
  progress?: number
  valueProps?: HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string>
  className?: string
  children?: ReactNode
}) {
  const color = DOT[tone]
  return (
    <div className={cn('glass-card lift flex min-w-0 flex-col gap-2.5 p-[18px]', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 text-[13px] text-ink-500">{label}</span>
        <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      </div>
      <div className="text-[28px] leading-tight font-bold tracking-[-.01em] text-ink-900 tabular-nums" {...valueProps}>
        {value}
      </div>
      {progress !== undefined && (
        <div className="h-[5px] overflow-hidden rounded-full" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`, background: color }}
          />
        </div>
      )}
      {children}
    </div>
  )
}

/** Grid for StatCards: auto-fit, 180px minimum. */
export function StatGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5', className)} {...props} />
}
