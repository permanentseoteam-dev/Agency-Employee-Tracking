import { cn } from '@/lib/cn'
import { pb, type UserRecord } from '@/lib/pb'

export function initials(name: string | undefined, fallback = '?'): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return fallback
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export function Avatar({ user, size = 32, className }: { user: UserRecord; size?: number; className?: string }) {
  const style = { width: size, height: size }
  if (user.avatar) {
    return (
      <img
        src={pb.files.getURL(user, user.avatar)}
        alt=""
        style={style}
        className={cn('rounded-full object-cover', className)}
      />
    )
  }
  return (
    <span
      style={style}
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
        className
      )}
    >
      {initials(user.full_name, user.email?.[0]?.toUpperCase())}
    </span>
  )
}
