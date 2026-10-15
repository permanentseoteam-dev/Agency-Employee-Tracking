import PocketBase from 'pocketbase'

/** The one PocketBase client for the renderer. The session is kept in localStorage by the SDK. */
export const pb = new PocketBase(import.meta.env.VITE_PB_URL)

// Screens fire overlapping requests (e.g. TanStack Query refetches); don't let the SDK cancel them.
pb.autoCancellation(false)

export type Role = 'admin' | 'manager' | 'employee'

export interface UserRecord {
  id: string
  updated: string
  email?: string
  full_name: string
  avatar: string
  designation: string
  phone: string
  team: string
  role: Role
  joined_on: string
  left_on: string
  active: boolean
  must_change_password: boolean
  tracking_consent_at: string
  /** Signed up with Create an account and not yet approved by an admin. */
  pending_approval?: boolean
}

export interface OrgSettings {
  id: string
  updated: string
  shift_start: string
  shift_end: string
  work_days: number[]
  grace_minutes: number
  full_day_min_hours: number
  half_day_min_hours: number
  idle_threshold_minutes: number
  late_penalty_pkr: number
  timezone: string
}
