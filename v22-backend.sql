-- MediBridge v22 — Diagnostics / Lab Network
-- Run once in Supabase SQL Editor.

-- Extend profile role.
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('patient','doctor','hospital','pharmacy','lab','admin'));

-- Public signup roles, never admin.
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

  if requested_role not in ('patient','doctor','hospital','pharmacy','lab') then
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

create table if not exists public.lab_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  lab_name text not null,
  registration_number text not null,
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

alter table public.lab_profiles enable row level security;

drop policy if exists "Lab can view own profile" on public.lab_profiles;
create policy "Lab can view own profile"
on public.lab_profiles for select to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "Verified labs are discoverable" on public.lab_profiles;
create policy "Verified labs are discoverable"
on public.lab_profiles for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = lab_profiles.id
      and p.role = 'lab'
      and p.verification_status = 'verified'
  )
);

drop policy if exists "Lab can insert own profile" on public.lab_profiles;
create policy "Lab can insert own profile"
on public.lab_profiles for insert to authenticated
with check (
  id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role='lab'
  )
);

drop policy if exists "Lab can update own profile" on public.lab_profiles;
create policy "Lab can update own profile"
on public.lab_profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create table if not exists public.lab_tests (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.lab_profiles(id) on delete cascade,
  test_name text not null,
  category text not null check (category in ('laboratory','imaging','pathology','cardiology','other')),
  sample_or_modality text,
  turnaround_time text,
  indicative_price numeric(12,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lab_tests enable row level security;

drop policy if exists "Verified lab tests are discoverable" on public.lab_tests;
create policy "Verified lab tests are discoverable"
on public.lab_tests for select to authenticated
using (
  is_active
  and exists (
    select 1 from public.profiles p
    where p.id = lab_tests.lab_id
      and p.role='lab'
      and p.verification_status='verified'
  )
);

drop policy if exists "Lab manages own tests" on public.lab_tests;
create policy "Lab manages own tests"
on public.lab_tests for all to authenticated
using (lab_id = auth.uid())
with check (
  lab_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id=auth.uid()
      and p.role='lab'
      and p.verification_status='verified'
  )
);

create table if not exists public.diagnostic_requests (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  lab_id uuid not null references public.lab_profiles(id) on delete cascade,
  requested_date date,
  preferred_time time,
  status text not null default 'requested'
    check (status in ('requested','accepted','sample_pending','in_process','report_ready','completed','rejected','cancelled')),
  patient_note text,
  lab_note text,
  requested_at timestamptz not null default now(),
  accepted_at timestamptz,
  report_ready_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.diagnostic_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.diagnostic_requests(id) on delete cascade,
  lab_test_id uuid references public.lab_tests(id) on delete set null,
  test_name text not null,
  category text not null,
  sample_or_modality text,
  indicative_price numeric(12,2),
  created_at timestamptz not null default now()
);

alter table public.diagnostic_requests enable row level security;
alter table public.diagnostic_request_items enable row level security;

drop policy if exists "Patient sees own diagnostic requests" on public.diagnostic_requests;
create policy "Patient sees own diagnostic requests"
on public.diagnostic_requests for select to authenticated
using (patient_id = auth.uid());

drop policy if exists "Lab sees own diagnostic requests" on public.diagnostic_requests;
create policy "Lab sees own diagnostic requests"
on public.diagnostic_requests for select to authenticated
using (
  lab_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.id=auth.uid()
      and p.role='lab'
      and p.verification_status='verified'
  )
);

drop policy if exists "Diagnostic request participants see items" on public.diagnostic_request_items;
create policy "Diagnostic request participants see items"
on public.diagnostic_request_items for select to authenticated
using (
  exists (
    select 1 from public.diagnostic_requests r
    where r.id=request_id
      and (
        r.patient_id=auth.uid()
        or r.lab_id=auth.uid()
        or public.is_admin()
      )
  )
);

-- Safe discovery endpoint to avoid profiles RLS blocking patient discovery.
create or replace function public.get_verified_labs()
returns table (
  id uuid,
  lab_name text,
  address text,
  city text,
  district text,
  state text,
  phone text,
  google_maps_url text,
  latitude double precision,
  longitude double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.id,l.lab_name,l.address,l.city,l.district,l.state,l.phone,
    l.google_maps_url,l.latitude,l.longitude
  from public.lab_profiles l
  join public.profiles p on p.id=l.id
  where p.role='lab'
    and p.verification_status='verified'
  order by l.lab_name;
$$;

revoke all on function public.get_verified_labs() from public;
grant execute on function public.get_verified_labs() to authenticated;

-- Patient creates a request from verified, active catalogue tests.
create or replace function public.create_diagnostic_request(
  target_lab uuid,
  target_test_ids uuid[],
  target_date date default null,
  target_time time default null,
  request_note text default null
)
returns public.diagnostic_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.diagnostic_requests%rowtype;
  requested_count integer;
  valid_count integer;
begin
  if not exists (
    select 1 from public.patient_profiles pp
    where pp.id=auth.uid()
  ) then
    raise exception 'Patient account required';
  end if;

  if not exists (
    select 1
    from public.profiles p
    join public.lab_profiles l on l.id=p.id
    where p.id=target_lab
      and p.role='lab'
      and p.verification_status='verified'
  ) then
    raise exception 'Verified diagnostic centre required';
  end if;

  requested_count := coalesce(array_length(target_test_ids,1),0);
  if requested_count = 0 then
    raise exception 'Select at least one test';
  end if;

  select count(*) into valid_count
  from public.lab_tests t
  where t.id = any(target_test_ids)
    and t.lab_id=target_lab
    and t.is_active=true;

  if valid_count <> requested_count then
    raise exception 'One or more selected tests are not available at this centre';
  end if;

  insert into public.diagnostic_requests(
    patient_id,lab_id,requested_date,preferred_time,patient_note
  )
  values(
    auth.uid(),target_lab,target_date,target_time,nullif(trim(request_note),'')
  )
  returning * into req;

  insert into public.diagnostic_request_items(
    request_id,lab_test_id,test_name,category,sample_or_modality,indicative_price
  )
  select
    req.id,t.id,t.test_name,t.category,t.sample_or_modality,t.indicative_price
  from public.lab_tests t
  where t.id=any(target_test_ids)
    and t.lab_id=target_lab
    and t.is_active=true;

  return req;
end;
$$;

grant execute on function public.create_diagnostic_request(uuid,uuid[],date,time,text)
to authenticated;

create or replace function public.cancel_diagnostic_request(
  target_request uuid
)
returns public.diagnostic_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.diagnostic_requests%rowtype;
begin
  update public.diagnostic_requests
  set status='cancelled',updated_at=now()
  where id=target_request
    and patient_id=auth.uid()
    and status='requested'
  returning * into req;

  if not found then
    raise exception 'Request cannot be cancelled';
  end if;

  return req;
end;
$$;

grant execute on function public.cancel_diagnostic_request(uuid)
to authenticated;

create or replace function public.update_diagnostic_request_status(
  target_request uuid,
  new_status text,
  note text default null
)
returns public.diagnostic_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status text;
  req public.diagnostic_requests%rowtype;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id=auth.uid()
      and p.role='lab'
      and p.verification_status='verified'
  ) then
    raise exception 'Verified diagnostic centre required';
  end if;

  select status into current_status
  from public.diagnostic_requests
  where id=target_request
    and lab_id=auth.uid()
  for update;

  if current_status is null then
    raise exception 'Diagnostic request not found';
  end if;

  if not (
    (current_status='requested' and new_status in ('accepted','rejected'))
    or (current_status='accepted' and new_status='sample_pending')
    or (current_status='sample_pending' and new_status='in_process')
    or (current_status='in_process' and new_status='report_ready')
    or (current_status='report_ready' and new_status='completed')
  ) then
    raise exception 'Invalid diagnostic status transition';
  end if;

  update public.diagnostic_requests
  set status=new_status,
      lab_note=coalesce(nullif(trim(note),''),lab_note),
      accepted_at=case when new_status='accepted' then now() else accepted_at end,
      report_ready_at=case when new_status='report_ready' then now() else report_ready_at end,
      completed_at=case when new_status='completed' then now() else completed_at end,
      updated_at=now()
  where id=target_request
  returning * into req;

  return req;
end;
$$;

grant execute on function public.update_diagnostic_request_status(uuid,text,text)
to authenticated;

create index if not exists lab_profiles_city_idx on public.lab_profiles(lower(city));
create index if not exists lab_profiles_district_idx on public.lab_profiles(lower(district));
create index if not exists lab_tests_lab_idx on public.lab_tests(lab_id,is_active);
create index if not exists diagnostic_requests_patient_idx on public.diagnostic_requests(patient_id,requested_at desc);
create index if not exists diagnostic_requests_lab_idx on public.diagnostic_requests(lab_id,requested_at desc);
