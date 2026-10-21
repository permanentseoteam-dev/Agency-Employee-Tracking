-- Managers can approve sign-ups too (2026-10-21): a manager may read the email of an account that
-- is waiting for approval, so they know who it is. Everyone else's email stays admin-only (and
-- your own). Approving and rejecting go through the org function, which checks the role.
-- Safe to run again.

drop policy if exists "managers read waiting sign-ups" on public.profile_emails;
create policy "managers read waiting sign-ups" on public.profile_emails for select to authenticated
  using (
    exists (select 1 from public.profiles me where me.id = public.my_id() and me.role = 'manager')
    and exists (select 1 from public.profiles p where p.id = profile_emails.id and p.pending_approval)
  );
