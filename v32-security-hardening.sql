-- MediBridge v32 — Security & Reliability Hardening
-- Run ONCE after all earlier migrations (including v30).
-- This migration intentionally does not add Family Profiles yet.

-- ============================================================================
-- 1. AUTHENTICATED AI RATE LIMIT / ROLE GATE
-- ============================================================================

create table if not exists public.ai_rate_limit_windows (
  user_id uuid not null references public.profiles(id) on delete cascade,
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, window_start)
);

alter table public.ai_rate_limit_windows enable row level security;

-- No browser/client should directly read or mutate this table.
revoke all on table public.ai_rate_limit_windows from anon, authenticated;

create or replace function public.consume_ai_rate_limit()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  account_role text;
  account_verification text;
  request_limit integer;
  current_count integer;
  start_at timestamptz := date_trunc('hour', now());
  end_at timestamptz := date_trunc('hour', now()) + interval '1 hour';
  retry_seconds integer;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;

  select role, verification_status
  into account_role, account_verification
  from public.profiles
  where id = uid;

  if account_role = 'patient' then
    request_limit := 30;
  elsif account_role = 'doctor' and account_verification = 'verified' then
    request_limit := 60;
  else
    return jsonb_build_object(
      'allowed', false,
      'role', coalesce(account_role, 'unknown'),
      'remaining', 0,
      'retry_after_seconds', 3600
    );
  end if;

  insert into public.ai_rate_limit_windows(user_id, window_start, request_count, updated_at)
  values(uid, start_at, 1, now())
  on conflict (user_id, window_start)
  do update set
    request_count = public.ai_rate_limit_windows.request_count + 1,
    updated_at = now()
  returning request_count into current_count;

  -- Small self-cleanup without a scheduled job.
  delete from public.ai_rate_limit_windows
  where user_id = uid
    and window_start < now() - interval '48 hours';

  retry_seconds := greatest(1, ceil(extract(epoch from (end_at - now())))::integer);

  return jsonb_build_object(
    'allowed', current_count <= request_limit,
    'role', account_role,
    'remaining', greatest(request_limit - current_count, 0),
    'retry_after_seconds', retry_seconds
  );
end;
$$;

revoke all on function public.consume_ai_rate_limit() from public;
grant execute on function public.consume_ai_rate_limit() to authenticated;

-- ============================================================================
-- 2. APPOINTMENT STATE MACHINE — TERMINAL STATES CANNOT BE REOPENED
-- ============================================================================

create or replace function public.protect_appointment_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  my_role text;
  transition_allowed boolean := false;
begin
  select role into my_role
  from public.profiles
  where id = auth.uid();

  if public.is_admin() then
    my_role := 'admin';
  end if;

  -- Core appointment identity/time is immutable after booking.
  if new.patient_id is distinct from old.patient_id
     or new.doctor_id is distinct from old.doctor_id
     or new.appointment_start is distinct from old.appointment_start
     or new.appointment_end is distinct from old.appointment_end
     or new.consultation_type is distinct from old.consultation_type
     or new.reason_for_visit is distinct from old.reason_for_visit then
    raise exception 'Appointment core details cannot be changed here';
  end if;

  if new.status is not distinct from old.status then
    new.updated_at := now();
    return new;
  end if;

  if old.status in ('completed','cancelled','no_show') then
    raise exception 'A closed appointment cannot be reopened';
  end if;

  if my_role = 'patient' then
    if auth.uid() <> old.patient_id then
      raise exception 'Not your appointment';
    end if;

    transition_allowed :=
      old.status in ('booked','confirmed')
      and new.status = 'cancelled';

  elsif my_role in ('doctor','admin') then
    if my_role = 'doctor' and auth.uid() <> old.doctor_id then
      raise exception 'Not your appointment';
    end if;

    transition_allowed :=
      (old.status = 'booked' and new.status in ('confirmed','cancelled','no_show'))
      or
      (old.status = 'confirmed' and new.status in ('completed','cancelled','no_show'));
  else
    raise exception 'Not allowed to update appointments';
  end if;

  if not transition_allowed then
    raise exception 'Invalid appointment status transition: % -> %', old.status, new.status;
  end if;

  -- Do not allow clinical completion/no-show before the appointment has started.
  if new.status in ('completed','no_show') and now() < old.appointment_start then
    raise exception 'Appointment cannot be closed before its scheduled start time';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- Existing trigger already points to this function; recreate defensively.
drop trigger if exists protect_appointment_update_trigger on public.appointments;
create trigger protect_appointment_update_trigger
before update on public.appointments
for each row execute function public.protect_appointment_update();

-- ============================================================================
-- 3. HOSPITAL APPOINTMENT STATE MACHINE
-- ============================================================================

create or replace function public.protect_hospital_appointment_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  my_role text;
  transition_allowed boolean := false;
begin
  select role into my_role
  from public.profiles
  where id = auth.uid();

  if public.is_admin() then
    my_role := 'admin';
  end if;

  if new.patient_id is distinct from old.patient_id
     or new.hospital_id is distinct from old.hospital_id
     or new.requested_start is distinct from old.requested_start
     or new.department is distinct from old.department
     or new.reason_for_visit is distinct from old.reason_for_visit then
    raise exception 'Hospital appointment core details cannot be changed here';
  end if;

  if new.status is not distinct from old.status then
    new.updated_at := now();
    return new;
  end if;

  if old.status in ('completed','cancelled','rejected') then
    raise exception 'A closed hospital appointment cannot be reopened';
  end if;

  if my_role = 'patient' then
    if auth.uid() <> old.patient_id then
      raise exception 'Not your hospital appointment';
    end if;

    transition_allowed :=
      old.status in ('requested','confirmed')
      and new.status = 'cancelled';

  elsif my_role in ('hospital','admin') then
    if my_role = 'hospital' and auth.uid() <> old.hospital_id then
      raise exception 'Not your hospital appointment';
    end if;

    transition_allowed :=
      (old.status = 'requested' and new.status in ('confirmed','rejected','cancelled'))
      or
      (old.status = 'confirmed' and new.status in ('completed','cancelled'));
  else
    raise exception 'Not allowed to update hospital appointments';
  end if;

  if not transition_allowed then
    raise exception 'Invalid hospital appointment status transition: % -> %', old.status, new.status;
  end if;

  if new.status = 'completed' and now() < old.requested_start then
    raise exception 'Hospital appointment cannot be completed before its requested start time';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_hospital_appointment_update_trigger on public.hospital_appointments;
create trigger protect_hospital_appointment_update_trigger
before update on public.hospital_appointments
for each row execute function public.protect_hospital_appointment_update();

-- ============================================================================
-- 4. EMERGENCY ARRIVAL NOTICE STATE MACHINE
-- ============================================================================

create or replace function public.protect_emergency_arrival_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  my_role text;
  transition_allowed boolean := false;
begin
  select role into my_role
  from public.profiles
  where id = auth.uid();

  if public.is_admin() then
    my_role := 'admin';
  end if;

  if new.patient_id is distinct from old.patient_id
     or new.hospital_id is distinct from old.hospital_id
     or new.emergency_type is distinct from old.emergency_type
     or new.eta_minutes is distinct from old.eta_minutes
     or new.note is distinct from old.note then
    raise exception 'Emergency arrival core details cannot be changed';
  end if;

  if new.status is not distinct from old.status then
    new.updated_at := now();
    return new;
  end if;

  if old.status in ('closed','cancelled') then
    raise exception 'A closed emergency arrival notice cannot be reopened';
  end if;

  if my_role = 'patient' then
    if auth.uid() <> old.patient_id then
      raise exception 'Not your emergency arrival notice';
    end if;

    transition_allowed :=
      old.status in ('sent','acknowledged')
      and new.status = 'cancelled';

  elsif my_role in ('hospital','admin') then
    if my_role = 'hospital' and auth.uid() <> old.hospital_id then
      raise exception 'Not your hospital emergency arrival notice';
    end if;

    transition_allowed :=
      (old.status = 'sent' and new.status in ('acknowledged','cancelled'))
      or
      (old.status = 'acknowledged' and new.status in ('arrived','closed','cancelled'))
      or
      (old.status = 'arrived' and new.status = 'closed');
  else
    raise exception 'Not allowed to update emergency arrivals';
  end if;

  if not transition_allowed then
    raise exception 'Invalid emergency arrival status transition: % -> %', old.status, new.status;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_emergency_arrival_update_trigger on public.emergency_arrival_requests;
create trigger protect_emergency_arrival_update_trigger
before update on public.emergency_arrival_requests
for each row execute function public.protect_emergency_arrival_update();

-- ============================================================================
-- 5. EMERGENCY AVAILABILITY FRESHNESS
-- ============================================================================

create or replace function public.stamp_hospital_emergency_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status_note is not null and char_length(new.status_note) > 500 then
    raise exception 'Emergency status note must be 500 characters or less';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists stamp_hospital_emergency_status_trigger on public.hospital_emergency_status;
create trigger stamp_hospital_emergency_status_trigger
before insert or update on public.hospital_emergency_status
for each row execute function public.stamp_hospital_emergency_status();

-- Return type changed in v32 to include status_updated_at, so drop/recreate.
drop function if exists public.nearby_emergency_hospitals(
  double precision,
  double precision,
  double precision,
  text
);

create function public.nearby_emergency_hospitals(
  user_lat double precision,
  user_lng double precision,
  radius_km double precision,
  needed_capability text default null
)
returns table (
  id uuid,
  hospital_name text,
  address text,
  city text,
  district text,
  state text,
  google_maps_url text,
  latitude numeric,
  longitude numeric,
  emergency_status text,
  emergency_beds_available integer,
  icu_beds_available integer,
  status_note text,
  status_updated_at timestamptz,
  capabilities text[],
  distance_km double precision
)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
begin
  if user_lat < -90 or user_lat > 90
     or user_lng < -180 or user_lng > 180 then
    raise exception 'Invalid coordinates';
  end if;

  if radius_km <= 0 or radius_km > 100 then
    raise exception 'Radius must be between 0 and 100 km';
  end if;

  return query
  with origin as (
    select extensions.st_setsrid(
      extensions.st_makepoint(user_lng, user_lat),
      4326
    )::extensions.geography as point
  )
  select
    h.id,
    h.hospital_name,
    h.address,
    h.city,
    h.district,
    h.state,
    h.google_maps_url,
    h.latitude,
    h.longitude,
    s.status,
    s.emergency_beds_available,
    s.icu_beds_available,
    s.status_note,
    s.updated_at,
    coalesce(
      array_agg(distinct c.capability) filter (where c.capability is not null),
      '{}'::text[]
    ),
    extensions.st_distance(h.location, o.point) / 1000.0
  from public.hospital_profiles h
  cross join origin o
  join public.hospital_emergency_status s on s.hospital_id = h.id
  left join public.hospital_capabilities c on c.hospital_id = h.id
  where h.emergency_available = true
    and public.is_verified_hospital(h.id)
    and h.location is not null
    and s.status in ('accepting','limited','diverting')
    and s.updated_at >= now() - interval '30 minutes'
    and extensions.st_dwithin(h.location, o.point, radius_km * 1000.0)
    and (
      needed_capability is null
      or trim(needed_capability) = ''
      or exists (
        select 1
        from public.hospital_capabilities hc
        where hc.hospital_id = h.id
          and hc.capability = needed_capability
      )
    )
  group by
    h.id, h.hospital_name, h.address, h.city, h.district, h.state,
    h.google_maps_url, h.latitude, h.longitude, h.location,
    s.status, s.emergency_beds_available, s.icu_beds_available,
    s.status_note, s.updated_at, o.point
  order by
    case s.status when 'accepting' then 0 when 'limited' then 1 else 2 end,
    extensions.st_distance(h.location, o.point);
end;
$$;

grant execute on function public.nearby_emergency_hospitals(
  double precision,
  double precision,
  double precision,
  text
) to anon, authenticated;

-- Drop defensively because v32 adds the freshness timestamp to the return shape.
drop function if exists public.district_emergency_hospitals(text,text);

create function public.district_emergency_hospitals(
  search_text text,
  needed_capability text default null
)
returns table (
  id uuid,
  hospital_name text,
  address text,
  city text,
  district text,
  state text,
  google_maps_url text,
  latitude numeric,
  longitude numeric,
  emergency_status text,
  emergency_beds_available integer,
  icu_beds_available integer,
  status_note text,
  status_updated_at timestamptz,
  capabilities text[],
  distance_km double precision
)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if search_text is null or char_length(trim(search_text)) < 2 then
    raise exception 'Enter at least 2 characters for district/city search';
  end if;

  return query
  select
    h.id,
    h.hospital_name,
    h.address,
    h.city,
    h.district,
    h.state,
    h.google_maps_url,
    h.latitude,
    h.longitude,
    s.status,
    s.emergency_beds_available,
    s.icu_beds_available,
    s.status_note,
    s.updated_at,
    coalesce(
      array_agg(distinct c.capability) filter (where c.capability is not null),
      '{}'::text[]
    ),
    null::double precision
  from public.hospital_profiles h
  join public.hospital_emergency_status s on s.hospital_id = h.id
  left join public.hospital_capabilities c on c.hospital_id = h.id
  where h.emergency_available = true
    and public.is_verified_hospital(h.id)
    and s.status in ('accepting','limited','diverting')
    and s.updated_at >= now() - interval '30 minutes'
    and (
      h.district ilike '%' || trim(search_text) || '%'
      or h.city ilike '%' || trim(search_text) || '%'
    )
    and (
      needed_capability is null
      or trim(needed_capability) = ''
      or exists (
        select 1
        from public.hospital_capabilities hc
        where hc.hospital_id = h.id
          and hc.capability = needed_capability
      )
    )
  group by
    h.id, h.hospital_name, h.address, h.city, h.district, h.state,
    h.google_maps_url, h.latitude, h.longitude,
    s.status, s.emergency_beds_available, s.icu_beds_available,
    s.status_note, s.updated_at
  order by
    case s.status when 'accepting' then 0 when 'limited' then 1 else 2 end,
    s.emergency_beds_available desc nulls last,
    h.hospital_name;
end;
$$;

grant execute on function public.district_emergency_hospitals(text,text)
to anon, authenticated;

-- ============================================================================
-- 6. CARE-PLAN IMMUTABILITY
-- ============================================================================

create or replace function public.protect_care_plan_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.patient_id is distinct from old.patient_id
     or new.doctor_id is distinct from old.doctor_id
     or new.source_appointment_id is distinct from old.source_appointment_id
     or new.start_date is distinct from old.start_date
     or new.created_at is distinct from old.created_at then
    raise exception 'Care plan identity/source fields are immutable';
  end if;

  if old.status in ('completed','cancelled') then
    raise exception 'A closed care plan is read-only';
  end if;

  if new.status is distinct from old.status
     and not (old.status = 'active' and new.status in ('completed','cancelled')) then
    raise exception 'Invalid care plan status transition';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_care_plan_update_trigger on public.care_plans;
create trigger protect_care_plan_update_trigger
before update on public.care_plans
for each row execute function public.protect_care_plan_update();

create or replace function public.protect_care_plan_task_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_status text;
begin
  if new.care_plan_id is distinct from old.care_plan_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Care-plan task identity fields are immutable';
  end if;

  select status into parent_status
  from public.care_plans
  where id = old.care_plan_id;

  if parent_status <> 'active' then
    raise exception 'Tasks on a closed care plan are read-only';
  end if;

  if old.status in ('completed','cancelled') then
    raise exception 'A closed care-plan task is read-only';
  end if;

  if new.status is distinct from old.status
     and not (old.status = 'pending' and new.status in ('completed','cancelled')) then
    raise exception 'Invalid care-plan task status transition';
  end if;

  if new.status = 'completed' then
    new.completed_at := coalesce(old.completed_at, now());
  elsif new.status = 'cancelled' then
    new.completed_at := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_care_plan_task_update_trigger on public.care_plan_tasks;
create trigger protect_care_plan_task_update_trigger
before update on public.care_plan_tasks
for each row execute function public.protect_care_plan_task_update();

-- ============================================================================
-- 7. SAFER FILE TYPES FOR HEALTHCARE DOCUMENT EXCHANGE
-- ============================================================================

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
]
where id in ('Appointment files','Medical reports');

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'image/jpeg',
  'image/png'
]
where id = 'Doctor verification';

-- Enforce MIME metadata on NEW appointment file metadata rows while allowing
-- any legacy rows to remain until explicitly cleaned up.
alter table public.appointment_files
  drop constraint if exists appointment_files_safe_mime_v32;

alter table public.appointment_files
  add constraint appointment_files_safe_mime_v32
  check (
    coalesce(mime_type,'') in (
      'application/pdf','image/jpeg','image/png','image/webp'
    )
  ) not valid;

alter table public.medical_reports
  drop constraint if exists medical_reports_safe_mime_v32;

alter table public.medical_reports
  add constraint medical_reports_safe_mime_v32
  check (
    coalesce(mime_type,'') in (
      'application/pdf','image/jpeg','image/png','image/webp'
    )
  ) not valid;

-- Existing legacy rows are intentionally not validated by this migration.
-- New rows must satisfy the safer MIME constraints immediately.

-- ============================================================================
-- END v32
-- ============================================================================
