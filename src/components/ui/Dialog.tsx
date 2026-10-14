import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Modal built on the native <dialog> element (focus trap and Esc come for free). */
export function Dialog({
  open,
  onClose,
  title,
  children,
  className
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className={cn(
        'm-auto w-full max-w-md rounded-lg border border-slate-200 bg-white p-0 text-slate-900 shadow-xl',
        'backdrop:bg-slate-950/50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100',
        className
      )}
    >
      <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      <div className="px-5 py-4">{children}</div>
    </dialog>
  )
}
