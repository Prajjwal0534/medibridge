-- MediBridge v21 — Pharmacy Network
-- Run once in Supabase SQL Editor.

-- Extend account roles safely.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('patient','doctor','hospital','pharmacy','admin'));

-- Signup trigger: pharmacy is a public signup role, admin never is.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text;
begin
  requested_role := coalesce(new.raw_user_meta_data->>'role', 'patient');

  if requested_role not in ('patient','doctor','hospital','pharmacy') then
    requested_role := 'patient';
  end if;

  insert into public.profiles (id, full_name, role, verification_status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    requested_role,
    case when requested_role = 'patient' then 'verified' else 'pending' end
  )
  on conflict (id) do nothing;

  if requested_role = 'patient' then
    insert into public.patient_profiles (id)
    values (new.id)
    on conflict (id) do nothing;
  end if;

  return new;
end;
$$;

-- Pharmacy professional profile.
create table if not exists public.pharmacy_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  pharmacy_name text not null,
  drug_license_number text not null,
  address text,
  city text,
  district text,
  state text default 'Uttar Pradesh',
  phone text,
  google_maps_url text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pharmacy_profiles enable row level security;

drop policy if exists "Pharmacy can view own profile" on public.pharmacy_profiles;
create policy "Pharmacy can view own profile"
on public.pharmacy_profiles for select to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "Verified pharmacies are discoverable" on public.pharmacy_profiles;
create policy "Verified pharmacies are discoverable"
on public.pharmacy_profiles for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = pharmacy_profiles.id
      and p.role = 'pharmacy'
      and p.verification_status = 'verified'
  )
);

drop policy if exists "Pharmacy can insert own profile" on public.pharmacy_profiles;
create policy "Pharmacy can insert own profile"
on public.pharmacy_profiles for insert to authenticated
with check (
  id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'pharmacy'
  )
);

drop policy if exists "Pharmacy can update own profile" on public.pharmacy_profiles;
create policy "Pharmacy can update own profile"
on public.pharmacy_profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Prescription fulfilment requests.
create table if not exists public.pharmacy_requests (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  pharmacy_id uuid not null references public.pharmacy_profiles(id) on delete cascade,
  consultation_id uuid not null references public.consultations(id) on delete cascade,
  status text not null default 'requested'
    check (status in ('requested','accepted','preparing','ready','fulfilled','rejected','cancelled')),
  patient_note text,
  pharmacy_note text,
  requested_at timestamptz not null default now(),
  accepted_at timestamptz,
  ready_at timestamptz,
  fulfilled_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.pharmacy_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.pharmacy_requests(id) on delete cascade,
  medicine_name text not null,
  strength text,
  dose text,
  frequency text,
  duration text,
  instructions text,
  created_at timestamptz not null default now()
);

create unique index if not exists one_active_pharmacy_request_per_consultation
on public.pharmacy_requests(patient_id, consultation_id)
where status in ('requested','accepted','preparing','ready');

create index if not exists pharmacy_requests_pharmacy_idx
on public.pharmacy_requests(pharmacy_id, requested_at desc);

create index if not exists pharmacy_requests_patient_idx
on public.pharmacy_requests(patient_id, requested_at desc);

alter table public.pharmacy_requests enable row level security;
alter table public.pharmacy_request_items enable row level security;

drop policy if exists "Patients see own pharmacy requests" on public.pharmacy_requests;
create policy "Patients see own pharmacy requests"
on public.pharmacy_requests for select to authenticated
using (patient_id = auth.uid());

drop policy if exists "Pharmacy sees own requests" on public.pharmacy_requests;
create policy "Pharmacy sees own requests"
on public.pharmacy_requests for select to authenticated
using (
  pharmacy_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'pharmacy'
      and p.verification_status = 'verified'
  )
);

drop policy if exists "Admin sees pharmacy requests" on public.pharmacy_requests;
create policy "Admin sees pharmacy requests"
on public.pharmacy_requests for select to authenticated
using (public.is_admin());

drop policy if exists "Request participants see request items" on public.pharmacy_request_items;
create policy "Request participants see request items"
on public.pharmacy_request_items for select to authenticated
using (
  exists (
    select 1 from public.pharmacy_requests r
    where r.id = request_id
      and (
        r.patient_id = auth.uid()
        or r.pharmacy_id = auth.uid()
        or public.is_admin()
      )
  )
);

-- Patient creates request through RPC; prescription is copied server-side.
create or replace function public.create_pharmacy_request(
  target_consultation uuid,
  target_pharmacy uuid,
  request_note text default null
)
returns public.pharmacy_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.consultations%rowtype;
  req public.pharmacy_requests%rowtype;
begin
  select * into c
  from public.consultations
  where id = target_consultation
    and patient_id = auth.uid();

  if not found then
    raise exception 'Consultation not found for this patient';
  end if;

  if not exists (
    select 1
    from public.profiles p
    join public.pharmacy_profiles ph on ph.id = p.id
    where p.id = target_pharmacy
      and p.role = 'pharmacy'
      and p.verification_status = 'verified'
  ) then
    raise exception 'Verified pharmacy required';
  end if;

  if not exists (
    select 1 from public.prescription_items pi
    where pi.consultation_id = target_consultation
  ) then
    raise exception 'This consultation has no prescription items';
  end if;

  if exists (
    select 1 from public.pharmacy_requests r
    where r.patient_id = auth.uid()
      and r.consultation_id = target_consultation
      and r.status in ('requested','accepted','preparing','ready')
  ) then
    raise exception 'An active pharmacy request already exists for this prescription';
  end if;

  insert into public.pharmacy_requests (
    patient_id, pharmacy_id, consultation_id, patient_note
  )
  values (
    auth.uid(), target_pharmacy, target_consultation, nullif(trim(request_note),'')
  )
  returning * into req;

  insert into public.pharmacy_request_items (
    request_id, medicine_name, strength, dose, frequency, duration, instructions
  )
  select
    req.id, medicine_name, strength, dose, frequency, duration, instructions
  from public.prescription_items
  where consultation_id = target_consultation;

  return req;
end;
$$;

grant execute on function public.create_pharmacy_request(uuid,uuid,text)
to authenticated;

-- Patient can cancel only while pharmacy has not accepted.
create or replace function public.cancel_pharmacy_request(
  target_request uuid
)
returns public.pharmacy_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.pharmacy_requests%rowtype;
begin
  update public.pharmacy_requests
  set status = 'cancelled',
      updated_at = now()
  where id = target_request
    and patient_id = auth.uid()
    and status = 'requested'
  returning * into req;

  if not found then
    raise exception 'Request cannot be cancelled';
  end if;

  return req;
end;
$$;

grant execute on function public.cancel_pharmacy_request(uuid)
to authenticated;

-- Verified pharmacy moves a request through fulfilment workflow.
create or replace function public.update_pharmacy_request_status(
  target_request uuid,
  new_status text,
  note text default null
)
returns public.pharmacy_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.pharmacy_requests%rowtype;
  current_status text;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'pharmacy'
      and p.verification_status = 'verified'
  ) then
    raise exception 'Verified pharmacy required';
  end if;

  select status into current_status
  from public.pharmacy_requests
  where id = target_request
    and pharmacy_id = auth.uid()
  for update;

  if current_status is null then
    raise exception 'Request not found';
  end if;

  if not (
    (current_status = 'requested' and new_status in ('accepted','rejected'))
    or (current_status = 'accepted' and new_status = 'preparing')
    or (current_status = 'preparing' and new_status = 'ready')
    or (current_status = 'ready' and new_status = 'fulfilled')
  ) then
    raise exception 'Invalid pharmacy request status transition';
  end if;

  update public.pharmacy_requests
  set status = new_status,
      pharmacy_note = coalesce(nullif(trim(note),''), pharmacy_note),
      accepted_at = case when new_status='accepted' then now() else accepted_at end,
      ready_at = case when new_status='ready' then now() else ready_at end,
      fulfilled_at = case when new_status='fulfilled' then now() else fulfilled_at end,
      updated_at = now()
  where id = target_request
  returning * into req;

  return req;
end;
$$;

grant execute on function public.update_pharmacy_request_status(uuid,text,text)
to authenticated;
