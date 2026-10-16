import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/** Frosted glass card (docs/ui/ux.md). `lift` adds the 2px hover lift. */
export function Card({ className, lift, ...props }: HTMLAttributes<HTMLDivElement> & { lift?: boolean }) {
  return <div className={cn('glass-card', lift && 'lift', className)} {...props} />
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-6 pt-5 pb-3', className)} {...props} />
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-base font-bold text-ink-900', className)} {...props} />
}

export function CardSubtitle({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-[12.5px] text-ink-500', className)} {...props} />
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-6 py-4', className)} {...props} />
}
