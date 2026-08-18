-- MediBridge v9: hospital network + emergency capability/status foundation
-- Run once in Supabase SQL Editor before deploying v9.

create or replace function public.is_verified_hospital(target_user uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = target_user
      and role = 'hospital'
      and verification_status = 'verified'
  );
$$;


create table if not exists public.hospital_capabilities (
  hospital_id uuid not null
    references public.hospital_profiles(id)
    on delete cascade,

  capability text not null
    check (capability in (
      'trauma',
      'cardiac',
      'stroke',
      'maternity',
      'pediatric',
      'icu',
      'emergency_surgery',
      'blood_bank'
    )),

  created_at timestamptz not null default now(),

  primary key (hospital_id, capability)
);


create table if not exists public.hospital_emergency_status (
  hospital_id uuid primary key
    references public.hospital_profiles(id)
    on delete cascade,

  status text not null default 'offline'
    check (status in (
      'accepting',
      'limited',
      'diverting',
      'offline'
    )),

  emergency_beds_available integer
    check (emergency_beds_available is null or emergency_beds_available >= 0),

  icu_beds_available integer
    check (icu_beds_available is null or icu_beds_available >= 0),

  status_note text,
  updated_at timestamptz not null default now()
);


alter table public.hospital_capabilities enable row level security;
alter table public.hospital_emergency_status enable row level security;


-- Public discovery of verified hospital facility information.
drop policy if exists "Users can view verified hospitals" on public.hospital_profiles;

create policy "Public can view verified hospitals"
on public.hospital_profiles
for select
to anon, authenticated
using (
  public.is_verified_hospital(id)
);


drop policy if exists "Public can view verified hospital capabilities"
on public.hospital_capabilities;

create policy "Public can view verified hospital capabilities"
on public.hospital_capabilities
for select
to anon, authenticated
using (
  public.is_verified_hospital(hospital_id)
);


drop policy if exists "Public can view verified hospital emergency status"
on public.hospital_emergency_status;

create policy "Public can view verified hospital emergency status"
on public.hospital_emergency_status
for select
to anon, authenticated
using (
  public.is_verified_hospital(hospital_id)
);


-- Verified hospitals manage only their own capability rows.
drop policy if exists "Hospitals can add own capabilities"
on public.hospital_capabilities;

create policy "Hospitals can add own capabilities"
on public.hospital_capabilities
for insert
to authenticated
with check (
  hospital_id = auth.uid()
  and public.is_verified_hospital(auth.uid())
);

drop policy if exists "Hospitals can delete own capabilities"
on public.hospital_capabilities;

create policy "Hospitals can delete own capabilities"
on public.hospital_capabilities
for delete
to authenticated
using (
  hospital_id = auth.uid()
  and public.is_verified_hospital(auth.uid())
);


-- Verified hospitals manage their current emergency status.
drop policy if exists "Hospitals can create own emergency status"
on public.hospital_emergency_status;

create policy "Hospitals can create own emergency status"
on public.hospital_emergency_status
for insert
to authenticated
with check (
  hospital_id = auth.uid()
  and public.is_verified_hospital(auth.uid())
);

drop policy if exists "Hospitals can update own emergency status"
on public.hospital_emergency_status;

create policy "Hospitals can update own emergency status"
on public.hospital_emergency_status
for update
to authenticated
using (
  hospital_id = auth.uid()
  and public.is_verified_hospital(auth.uid())
)
with check (
  hospital_id = auth.uid()
  and public.is_verified_hospital(auth.uid())
);


-- Admin access to hospital network rows.
drop policy if exists "Admins can manage hospital capabilities"
on public.hospital_capabilities;

create policy "Admins can manage hospital capabilities"
on public.hospital_capabilities
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can manage hospital emergency status"
on public.hospital_emergency_status;

create policy "Admins can manage hospital emergency status"
on public.hospital_emergency_status
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
