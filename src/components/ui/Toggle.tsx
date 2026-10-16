import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/** Switch styled over a real checkbox, so labels, ids and tests keep working. */
export function Toggle({ className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return (
    <span className={cn('relative inline-flex h-6 w-10 shrink-0', className)}>
      <input type="checkbox" className="peer absolute inset-0 z-10 m-0 cursor-pointer appearance-none rounded-full" {...props} />
      <span
        aria-hidden
        className="absolute inset-0 rounded-full bg-[var(--line-strong)] transition-colors duration-200 peer-checked:bg-indigo-500 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-indigo-400 peer-disabled:opacity-50"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200 peer-checked:translate-x-4"
      />
    </span>
  )
}
