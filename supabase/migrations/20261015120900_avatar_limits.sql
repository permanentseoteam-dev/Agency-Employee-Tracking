-- Profile pictures: the server now enforces what the app already checks (My Profile: PNG, JPEG or
-- WebP, at most 5 MB), and only an active, approved account may upload, change or delete its own
-- picture. Before, any account with a sign-in (for example one made directly with the public key
-- while sign-ups were on) could put any file in the public bucket.
update storage.buckets
set file_size_limit = 5242880, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
where id = 'avatars';

-- The storage service checks these rules itself; this helper reads the profile with the
-- account's own id (auth.uid()), so it works there as it does for the tables.
create or replace function public.can_manage_own_avatar(folder text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.id::text = folder and p.active and not p.pending_approval
  )
$$;
revoke execute on function public.can_manage_own_avatar(text) from public, anon;
grant execute on function public.can_manage_own_avatar(text) to authenticated;

-- Replacing a picture (My Profile uploads with upsert) needs a read rule too; the pictures are
-- public anyway (the bucket serves them to everyone), so signed-in people may read them.
drop policy if exists "avatar read" on storage.objects;
create policy "avatar read" on storage.objects for select to authenticated using (bucket_id = 'avatars');

drop policy "own avatar insert" on storage.objects;
drop policy "own avatar update" on storage.objects;
drop policy "own avatar delete" on storage.objects;
create policy "own avatar insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and public.can_manage_own_avatar((storage.foldername(name))[1]));
create policy "own avatar update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and public.can_manage_own_avatar((storage.foldername(name))[1]));
create policy "own avatar delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and public.can_manage_own_avatar((storage.foldername(name))[1]));
