-- MediBridge v39 governance, privacy-request, family-authority and upload guardrails
-- Deploy in Supabase SQL Editor before the v39 frontend.
-- This migration is additive and does not replace the required authenticated RLS test matrix.

begin;

create extension if not exists pgcrypto;

create or replace function public.medibridge_is_verified_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and verification_status = 'verified'
  );
$$;
revoke all on function public.medibridge_is_verified_admin() from public;
grant execute on function public.medibridge_is_verified_admin() to authenticated;

create table if not exists public.policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_notice_version text not null,
  account_authority text not null check (account_authority in ('adult_self','parent_guardian','organisation_representative')),
  accepted_at timestamptz not null default now(),
  source text not null default 'signup' check (source in ('signup','privacy_center','admin_migration')),
  created_at timestamptz not null default now(),
  unique (user_id, terms_version, privacy_notice_version)
);

alter table public.policy_acceptances enable row level security;
alter table public.policy_acceptances force row level security;
revoke all on public.policy_acceptances from anon;
grant select,insert on public.policy_acceptances to authenticated;
drop policy if exists policy_acceptances_select_own on public.policy_acceptances;
create policy policy_acceptances_select_own on public.policy_acceptances
  for select to authenticated using (user_id = auth.uid() or public.medibridge_is_verified_admin());
drop policy if exists policy_acceptances_insert_own on public.policy_acceptances;
create policy policy_acceptances_insert_own on public.policy_acceptances
  for insert to authenticated with check (user_id = auth.uid());

create or replace function public.capture_medibridge_policy_acceptance()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  terms_value text := nullif(new.raw_user_meta_data ->> 'terms_version','');
  privacy_value text := nullif(new.raw_user_meta_data ->> 'privacy_notice_version','');
  authority_value text := nullif(new.raw_user_meta_data ->> 'account_authority','');
  accepted_value timestamptz;
begin
  if terms_value is null or privacy_value is null or authority_value is null then
    return new;
  end if;
  if authority_value not in ('adult_self','parent_guardian','organisation_representative') then
    raise exception 'Unsupported account authority';
  end if;
  begin
    accepted_value := coalesce((new.raw_user_meta_data ->> 'policy_accepted_at')::timestamptz, now());
  exception when others then
    accepted_value := now();
  end;
  insert into public.policy_acceptances(user_id,terms_version,privacy_notice_version,account_authority,accepted_at,source)
  values(new.id,terms_value,privacy_value,authority_value,accepted_value,'signup')
  on conflict (user_id,terms_version,privacy_notice_version) do nothing;
  return new;
end;
$$;

drop trigger if exists capture_medibridge_policy_acceptance_trigger on auth.users;
create trigger capture_medibridge_policy_acceptance_trigger
after insert on auth.users
for each row execute function public.capture_medibridge_policy_acceptance();

create table if not exists public.data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  request_type text not null check (request_type in ('export','correction','restriction','withdraw_consent','deletion')),
  administrative_detail text check (administrative_detail is null or char_length(administrative_detail) <= 500),
  policy_version text not null,
  status text not null default 'received' check (status in ('received','in_progress','completed','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  handled_by uuid references auth.users(id),
  constraint data_subject_request_completion check (
    (status in ('received','in_progress') and completed_at is null)
    or (status in ('completed','rejected') and completed_at is not null)
  )
);
create index if not exists data_subject_requests_requester_idx on public.data_subject_requests(requester_id,created_at desc);
create index if not exists data_subject_requests_status_idx on public.data_subject_requests(status,created_at);
alter table public.data_subject_requests enable row level security;
alter table public.data_subject_requests force row level security;
revoke all on public.data_subject_requests from anon;
grant select,insert,update on public.data_subject_requests to authenticated;
drop policy if exists data_subject_requests_select_own_or_admin on public.data_subject_requests;
create policy data_subject_requests_select_own_or_admin on public.data_subject_requests
  for select to authenticated using (requester_id = auth.uid() or public.medibridge_is_verified_admin());
drop policy if exists data_subject_requests_insert_own on public.data_subject_requests;
create policy data_subject_requests_insert_own on public.data_subject_requests
  for insert to authenticated with check (
    requester_id = auth.uid()
    and status = 'received'
    and completed_at is null
    and handled_by is null
  );
drop policy if exists data_subject_requests_admin_update on public.data_subject_requests;
create policy data_subject_requests_admin_update on public.data_subject_requests
  for update to authenticated using (public.medibridge_is_verified_admin())
  with check (public.medibridge_is_verified_admin());

create table if not exists public.family_management_authorizations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null references public.patient_subjects(id) on delete cascade,
  authority_basis text not null check (authority_basis in ('direct_permission','parent_guardian','lawful_caregiver')),
  policy_version text not null,
  attested_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (patient_id,subject_id)
);
alter table public.family_management_authorizations enable row level security;
alter table public.family_management_authorizations force row level security;
revoke all on public.family_management_authorizations from anon;
grant select,insert,update on public.family_management_authorizations to authenticated;
drop policy if exists family_authorizations_select_own on public.family_management_authorizations;
create policy family_authorizations_select_own on public.family_management_authorizations
  for select to authenticated using (patient_id = auth.uid() or public.medibridge_is_verified_admin());
drop policy if exists family_authorizations_insert_own on public.family_management_authorizations;
create policy family_authorizations_insert_own on public.family_management_authorizations
  for insert to authenticated with check (
    patient_id = auth.uid()
    and exists (
      select 1 from public.patient_subjects s
      -- Do not assume a patient_subjects owner-column name. The deployed
      -- patient_subjects RLS policy exposes only subjects managed by auth.uid().
      -- Therefore a visible matching row is the ownership check.
      where s.id = family_management_authorizations.subject_id
    )
  );
drop policy if exists family_authorizations_update_own on public.family_management_authorizations;
create policy family_authorizations_update_own on public.family_management_authorizations
  for update to authenticated using (patient_id = auth.uid()) with check (patient_id = auth.uid());

create table if not exists public.mental_health_private_note_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.mental_health_appointments(id) on delete cascade,
  provider_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('deleted')),
  occurred_at timestamptz not null default now()
);
alter table public.mental_health_private_note_events enable row level security;
alter table public.mental_health_private_note_events force row level security;
revoke all on public.mental_health_private_note_events from anon;
grant select on public.mental_health_private_note_events to authenticated;
drop policy if exists mental_private_note_events_provider_select on public.mental_health_private_note_events;
create policy mental_private_note_events_provider_select on public.mental_health_private_note_events
  for select to authenticated using (provider_id = auth.uid() or public.medibridge_is_verified_admin());

create or replace function public.delete_my_mental_health_private_note(target_appointment uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  deleted_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.mental_health_appointments
    where id = target_appointment and provider_id = auth.uid()
  ) then
    raise exception 'Appointment not found or access denied';
  end if;
  delete from public.mental_health_private_notes
  where appointment_id = target_appointment and provider_id = auth.uid();
  get diagnostics deleted_count = row_count;
  if deleted_count > 0 then
    insert into public.mental_health_private_note_events(appointment_id,provider_id,event_type)
    values(target_appointment,auth.uid(),'deleted');
  end if;
  return deleted_count > 0;
end;
$$;
revoke all on function public.delete_my_mental_health_private_note(uuid) from public;
grant execute on function public.delete_my_mental_health_private_note(uuid) to authenticated;

-- Enforce private buckets and server-side size/MIME ceilings. Malware scanning and
-- quarantine still require an external scanner/worker before production launch.
update storage.buckets
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp']::text[]
where id = 'Appointment files';

update storage.buckets
set public = false,
    file_size_limit = 15728640,
    allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp']::text[]
where id = 'Medical reports';

update storage.buckets
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['application/pdf','image/jpeg','image/png']::text[]
where id in ('Doctor verification','Mental health verification');

update storage.buckets
set public = false,
    allowed_mime_types = array['application/pdf']::text[]
where id = 'Clinical knowledge documents';

commit;
