import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Field, Input } from '@/components/ui/Input'
import { Avatar } from '@/components/layout/Avatar'
import { AppError, must, supabase } from '@/lib/db'
import { ROLE_LABEL } from '@/lib/roles'
import { errorMessage, useSession } from '@/stores/session'

const MAX_AVATAR_BYTES = 5 * 1024 * 1024

export function MyProfile() {
  const user = useSession((s) => s.user)!
  const reload = useSession((s) => s.reload)
  const [fullName, setFullName] = useState(user.full_name)
  const [phone, setPhone] = useState(user.phone)
  const [designation, setDesignation] = useState(user.designation)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setFullName(user.full_name)
    setPhone(user.phone)
    setDesignation(user.designation)
  }, [user.id, user.full_name, user.phone, user.designation])

  const team = useQuery({
    queryKey: ['teams', user.team],
    queryFn: async () => must(await supabase.from('teams').select('name').eq('id', user.team).single()) as { name: string },
    enabled: !!user.team
  })

  /** Saves profile fields, or a new photo (a File: uploaded to my own folder first). */
  async function save(data: Record<string, unknown> | File, done: string) {
    setStatus(null)
    setBusy(true)
    try {
      let fields = data instanceof File ? null : data
      if (data instanceof File) {
        const name = `${Date.now()}.${(data.name.split('.').pop() || 'jpg').toLowerCase()}`
        const up = await supabase.storage.from('avatars').upload(`${user.id}/${name}`, data, { contentType: data.type, upsert: true })
        if (up.error) throw new AppError(400, up.error.message)
        fields = { avatar: name }
      }
      if (fields && 'avatar' in fields && fields.avatar === null) fields = { avatar: '' }
      const previous = user.avatar
      must(await supabase.from('profiles').update(fields!).eq('id', user.id).select())
      if (fields && 'avatar' in fields && previous && previous !== fields.avatar) {
        await supabase.storage.from('avatars').remove([`${user.id}/${previous}`]) // the old photo
      }
      await reload() // the signed-in record shows the change
      setStatus({ ok: true, text: done })
    } catch (err) {
      setStatus({ ok: false, text: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) {
      setStatus({ ok: false, text: 'Name cannot be empty.' })
      return
    }
    void save({ full_name: fullName.trim(), phone: phone.trim(), designation: designation.trim() }, 'Profile saved.')
  }

  function onAvatarPicked(file: File | undefined) {
    if (!file) return
    if (file.size > MAX_AVATAR_BYTES) {
      setStatus({ ok: false, text: 'The photo must be 5 MB or smaller.' })
      return
    }
    void save(file, 'Photo updated.')
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Photo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <Avatar user={user} size={64} />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
              Upload photo
            </Button>
            {user.avatar && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void save({ avatar: null }, 'Photo removed.')}>
                Remove
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                onAvatarPicked(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Full name" htmlFor="full_name">
              <Input id="full_name" value={fullName} maxLength={100} onChange={(e) => setFullName(e.target.value)} />
            </Field>
            <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2">
              <Field label="Phone" htmlFor="phone">
                <Input id="phone" value={phone} maxLength={30} onChange={(e) => setPhone(e.target.value)} />
              </Field>
              <Field label="Designation" htmlFor="designation">
                <Input id="designation" value={designation} maxLength={100} onChange={(e) => setDesignation(e.target.value)} />
              </Field>
            </div>
            <dl className="grid grid-cols-1 gap-4 rounded-md bg-slate-50 p-3 text-sm @xl:grid-cols-3 dark:bg-slate-950">
              <div className="min-w-0">
                <dt className="text-xs text-slate-500">Email</dt>
                <dd className="truncate">{user.email}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-slate-500">Role</dt>
                <dd>{ROLE_LABEL[user.role]}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-slate-500">Team</dt>
                <dd className="truncate">{user.team ? (team.data?.name ?? '…') : 'No team'}</dd>
              </div>
            </dl>
            <p className="text-xs text-slate-500">Email, role and team are changed by an admin.</p>
            {status && (
              <p role="status" className={status.ok ? 'text-sm text-emerald-700' : 'text-sm text-red-600'}>
                {status.text}
              </p>
            )}
            <Button type="submit" loading={busy}>
              Save changes
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
