import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-soft'
type Size = 'sm' | 'md'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-[image:var(--brand-gradient)] text-white shadow-[0_8px_18px_-10px_rgba(29,56,179,.7)] hover:brightness-110 disabled:opacity-60',
  secondary: 'glass text-ink-900 hover:bg-[var(--glass-strong)]',
  ghost: 'text-ink-700 hover:bg-indigo-500/[.06] hover:text-indigo-700 dark:hover:text-indigo-300',
  danger: 'bg-[var(--danger)] text-white hover:brightness-95 disabled:opacity-60',
  'danger-soft': 'bg-[var(--danger-bg)] text-[var(--danger-text)] hover:brightness-95'
}

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-5 text-sm'
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, disabled, className, children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-semibold',
        'transition-[transform,filter,background-color,color] duration-200 ease-[var(--ease)] active:scale-[.98]',
        'disabled:cursor-not-allowed disabled:active:scale-100',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...props}
    >
      {loading && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  )
})
