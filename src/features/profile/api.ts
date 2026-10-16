import { useQuery } from '@tanstack/react-query'
import { must, supabase } from '@/lib/db'

/** The free plan's database limit. */
export const DATABASE_LIMIT_BYTES = 500 * 1024 * 1024

/** How big the database is, in bytes (admins only; null for everyone else). */
export function useDatabaseSize(enabled: boolean) {
  return useQuery({
    queryKey: ['settings', 'database-size'],
    queryFn: async () => {
      const bytes = must(await supabase.rpc('database_size')) as number | string | null
      return bytes === null ? null : Number(bytes)
    },
    enabled,
    staleTime: 10 * 60_000
  })
}
