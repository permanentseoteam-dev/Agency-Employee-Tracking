import { forwardRef, type InputHTMLAttributes, type LabelHTMLAttributes, type SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

const FIELD =
  'h-10 w-full rounded-[var(--radius-control)] border border-line bg-[var(--glass-strong)] px-3 text-sm text-ink-900 placeholder:text-ink-400 ' +
  'transition-shadow focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/60 ' +
  'disabled:cursor-not-allowed disabled:opacity-60'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref
) {
  return <input ref={ref} className={cn(FIELD, className)} {...props} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, ...props },
  ref
) {
  return <select ref={ref} className={cn(FIELD, 'pr-8', className)} {...props} />
})

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1.5 block text-sm font-medium text-ink-700', className)} {...props} />
}

/** Label + control + optional error, stacked. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  children
}: {
  label: string
  htmlFor: string
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-[var(--danger-text)]">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-500">{hint}</p>
      ) : null}
    </div>
  )
}
