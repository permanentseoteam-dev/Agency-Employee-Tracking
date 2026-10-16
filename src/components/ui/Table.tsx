import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto px-4 pb-2">
      <table className={cn('w-full border-collapse text-sm tabular-nums [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-indigo-500/[.04]', className)} {...props} />
    </div>
  )
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn('px-2 py-3 text-left text-[11.5px] font-semibold tracking-[.05em] text-ink-400 uppercase', className)}
      {...props}
    />
  )
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('border-t border-line px-2 py-3.5', className)} {...props} />
}
