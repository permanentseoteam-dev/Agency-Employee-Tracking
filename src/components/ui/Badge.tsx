import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type Tone = 'neutral' | 'green' | 'amber' | 'orange' | 'red' | 'blue'

/** Status chip colours from the tokens: green = success, amber = warning, red = danger, blue = info. */
export const TONES: Record<Tone, string> = {
  neutral: 'bg-[var(--neutral-bg)] text-[var(--neutral-text)]',
  green: 'bg-[var(--success-bg)] text-[var(--success-text)]',
  amber: 'bg-[var(--warning-bg)] text-[var(--warning-text)]',
  orange: 'bg-[var(--orange-bg)] text-[var(--orange-text)]',
  red: 'bg-[var(--danger-bg)] text-[var(--danger-text)]',
  blue: 'bg-[var(--info-bg)] text-[var(--info-text)]'
}

export function Badge({ tone = 'neutral', className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs leading-none font-semibold whitespace-nowrap', TONES[tone], className)}
      {...props}
    />
  )
}
