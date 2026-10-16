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
        'm-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-[var(--radius-shell)] border border-[var(--glass-border-color)] p-0 text-ink-900',
        'bg-white/90 shadow-[var(--glass-shadow-hover)] backdrop-blur-xl dark:bg-slate-900/95',
        'backdrop:bg-[rgba(14,21,48,.35)] backdrop:backdrop-blur-[6px]',
        // Title stays put; the body scrolls when the window is short.
        'open:flex open:flex-col',
        className
      )}
    >
      <div className="shrink-0 px-6 pt-5 pb-1">
        <h2 className="text-base font-bold wrap-break-word">{title}</h2>
      </div>
      <div className="min-h-0 overflow-y-auto px-6 py-4">{children}</div>
    </dialog>
  )
}
