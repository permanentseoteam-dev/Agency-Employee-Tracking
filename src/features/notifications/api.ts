import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pb } from '@/lib/pb'
import type { NotificationRecord } from '@/lib/notifications'
import { useSession } from '@/stores/session'

/** How many recent notifications the bell lists. */
export const LIST_SIZE = 30

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (userId: string) => ['notifications', userId] as const
}

/** My latest notifications and the unread count, kept live by a realtime subscription. */
export function useNotifications() {
  const userId = useSession((s) => s.user?.id ?? '')
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: notificationKeys.list(userId),
    enabled: !!userId,
    queryFn: async () => {
      const mine = pb.filter('user = {:u}', { u: userId })
      const [latest, unread] = await Promise.all([
        pb.collection('notifications').getList<NotificationRecord>(1, LIST_SIZE, { filter: mine, sort: '-created' }),
        pb.collection('notifications').getList(1, 1, { filter: `${mine} && read_at = ""`, fields: 'id' })
      ])
      return { items: latest.items, unread: unread.totalItems }
    }
  })

  useEffect(() => {
    if (!userId) return
    let unsubscribe: (() => Promise<void>) | undefined
    let cancelled = false
    pb.collection('notifications')
      .subscribe('*', () => void qc.invalidateQueries({ queryKey: notificationKeys.list(userId) }), {
        filter: pb.filter('user = {:u}', { u: userId })
      })
      .then((fn) => {
        if (cancelled) void fn()
        else unsubscribe = fn
      })
      .catch(() => {
        /* offline: the refetch on reconnect catches up */
      })
    return () => {
      cancelled = true
      void unsubscribe?.()
    }
  }, [qc, userId])

  return query
}

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => pb.collection('notifications').update(id, { read_at: new Date().toISOString() }),
    onSettled: () => qc.invalidateQueries({ queryKey: notificationKeys.all })
  })
}

export function useMarkAllRead() {
  const userId = useSession((s) => s.user?.id ?? '')
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const unread = await pb.collection('notifications').getFullList({
        filter: pb.filter('user = {:u} && read_at = ""', { u: userId }),
        fields: 'id'
      })
      const now = new Date().toISOString()
      for (const n of unread) await pb.collection('notifications').update(n.id, { read_at: now })
    },
    onSettled: () => qc.invalidateQueries({ queryKey: notificationKeys.all })
  })
}
