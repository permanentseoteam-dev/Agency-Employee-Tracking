import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { live, must, supabase } from '@/lib/db'
import type { NotificationRecord } from '@/lib/notifications'
import { useSession } from '@/stores/session'

/** How many recent notifications the bell lists. */
export const LIST_SIZE = 30

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (userId: string) => ['notifications', userId] as const
}

/** My latest notifications and the unread count, kept live by Realtime (the rules send only my own). */
export function useNotifications() {
  const userId = useSession((s) => s.user?.id ?? '')
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: notificationKeys.list(userId),
    enabled: !!userId,
    queryFn: async () => {
      const [latest, unread] = await Promise.all([
        supabase.from('notifications').select('*').eq('user', userId).order('created', { ascending: false }).limit(LIST_SIZE),
        supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user', userId).is('read_at', null)
      ])
      const items = (must(latest) as NotificationRecord[]).map((n) => ({ ...n, read_at: n.read_at ?? '' }))
      must(unread)
      return { items, unread: unread.count ?? 0 }
    }
  })

  useEffect(
    () => (userId ? live('notifications', () => void qc.invalidateQueries({ queryKey: notificationKeys.list(userId) })) : undefined),
    [qc, userId]
  )

  return query
}

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => must(await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).select()),
    onSettled: () => qc.invalidateQueries({ queryKey: notificationKeys.all })
  })
}

export function useMarkAllRead() {
  const userId = useSession((s) => s.user?.id ?? '')
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () =>
      must(await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user', userId).is('read_at', null).select('id')),
    onSettled: () => qc.invalidateQueries({ queryKey: notificationKeys.all })
  })
}
