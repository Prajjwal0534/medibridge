-- MediBridge v9.6: accurate doctor clinic location + hospital appointment booking
-- Run once in Supabase SQL Editor before deploying v9.6.

create extension if not exists postgis with schema extensions;

-- Doctor clinic geographic point
alter table public.doctor_profiles
add column if not exists clinic_location extensions.geography(POINT, 4326);

update public.doctor_profiles
set clinic_location =
  extensions.st_setsrid(
    extensions.st_makepoint(
      clinic_longitude::double precision,
      clinic_latitude::double precision
    ),
    4326
  )::extensions.geography
where clinic_latitude is not null
  and clinic_longitude is not null;

create or replace function public.sync_doctor_clinic_location()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.clinic_latitude is null and new.clinic_longitude is null then
    new.clinic_location := null;
    return new;
  end if;

  if new.clinic_latitude is null or new.clinic_longitude is null then
    raise exception 'Clinic latitude and longitude must both be provided';
  end if;

  if new.clinic_latitude < -90 or new.clinic_latitude > 90 then
    raise exception 'Clinic latitude must be between -90 and 90';
  end if;

  if new.clinic_longitude < -180 or new.clinic_longitude > 180 then
    raise exception 'Clinic longitude must be between -180 and 180';
  end if;

  new.clinic_location :=
    extensions.st_setsrid(
      extensions.st_makepoint(
        new.clinic_longitude::double precision,
        new.clinic_latitude::double precision
      ),
      4326
    )::extensions.geography;

  return new;
end;
$$;

drop trigger if exists sync_doctor_clinic_location_trigger
on public.doctor_profiles;

create trigger sync_doctor_clinic_location_trigger
before insert or update of clinic_latitude, clinic_longitude
on public.doctor_profiles
for each row
execute function public.sync_doctor_clinic_location();

create index if not exists doctor_profiles_clinic_location_gix
on public.doctor_profiles
using gist (clinic_location);


-- Nearby verified doctors with exact PostGIS distance
create or replace function public.nearby_verified_doctors(
  user_lat double precision,
  user_lng double precision,
  radius_km double precision
)
returns table (
  id uuid,
  full_name text,
  specialty text,
  qualification text,
  hospital_name text,
  experience_years integer,
  google_maps_url text,
  clinic_latitude numeric,
  clinic_longitude numeric,
  distance_km double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with origin as (
    select
      extensions.st_setsrid(
        extensions.st_makepoint(user_lng, user_lat),
        4326
      )::extensions.geography as point
  )
  select
    d.id,
    p.full_name,
    d.specialty,
    d.qualification,
    d.hospital_name,
    d.experience_years,
    d.google_maps_url,
    d.clinic_latitude,
    d.clinic_longitude,
    extensions.st_distance(d.clinic_location, o.point) / 1000.0 as distance_km
  from public.doctor_profiles d
  join public.profiles p on p.id = d.id
  cross join origin o
  where p.role = 'doctor'
    and p.verification_status = 'verified'
    and d.clinic_location is not null
    and extensions.st_dwithin(
      d.clinic_location,
      o.point,
      radius_km * 1000.0
    )
  order by extensions.st_distance(d.clinic_location, o.point);
$$;

grant execute on function public.nearby_verified_doctors(
  double precision,
  double precision,
  double precision
) to authenticated;


-- Hospital appointment request
create table if not exists public.hospital_appointments (
  id uuid primary key default gen_random_uuid(),

  patient_id uuid not null
    references public.patient_profiles(id)
    on delete restrict,

  hospital_id uuid not null
    references public.hospital_profiles(id)
    on delete restrict,

  requested_start timestamptz not null,
  department text,
  reason_for_visit text,

  status text not null default 'requested'
    check (status in (
      'requested',
      'confirmed',
      'completed',
      'cancelled',
      'rejected'
    )),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hospital_appointments enable row level security;

drop policy if exists "Patients can view hospital appointments"
on public.hospital_appointments;

create policy "Patients can view hospital appointments"
on public.hospital_appointments
for select
to authenticated
using (patient_id = auth.uid());

drop policy if exists "Hospitals can view hospital appointments"
on public.hospital_appointments;

create policy "Hospitals can view hospital appointments"
on public.hospital_appointments
for select
to authenticated
using (hospital_id = auth.uid());

drop policy if exists "Admins can view hospital appointments"
on public.hospital_appointments;

create policy "Admins can view hospital appointments"
on public.hospital_appointments
for select
to authenticated
using (public.is_admin());

drop policy if exists "Patients can request hospital appointments"
on public.hospital_appointments;

create policy "Patients can request hospital appointments"
on public.hospital_appointments
for insert
to authenticated
with check (
  patient_id = auth.uid()
  and public.is_verified_hospital(hospital_id)
);

drop policy if exists "Patients can cancel hospital appointments"
on public.hospital_appointments;

create policy "Patients can cancel hospital appointments"
on public.hospital_appointments
for update
to authenticated
using (patient_id = auth.uid())
with check (patient_id = auth.uid());

drop policy if exists "Hospitals can update hospital appointments"
on public.hospital_appointments;

create policy "Hospitals can update hospital appointments"
on public.hospital_appointments
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

create or replace function public.protect_hospital_appointment_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  my_role text;
begin
  if public.is_admin() then
    new.updated_at := now();
    return new;
  end if;

  select role into my_role
  from public.profiles
  where id = auth.uid();

  if new.patient_id is distinct from old.patient_id
     or new.hospital_id is distinct from old.hospital_id
     or new.requested_start is distinct from old.requested_start
     or new.department is distinct from old.department
     or new.reason_for_visit is distinct from old.reason_for_visit then
    raise exception 'Hospital appointment core details cannot be changed here';
  end if;

  if my_role = 'patient' then
    if auth.uid() <> old.patient_id then
      raise exception 'Not your appointment';
    end if;

    if new.status is distinct from old.status
       and new.status <> 'cancelled' then
      raise exception 'Patients may only cancel hospital appointments';
    end if;

  elsif my_role = 'hospital' then
    if auth.uid() <> old.hospital_id then
      raise exception 'Not your hospital appointment';
    end if;

    if new.status is distinct from old.status
       and new.status not in ('confirmed','completed','cancelled','rejected') then
      raise exception 'Invalid hospital appointment status';
    end if;

  else
    raise exception 'Not allowed';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_hospital_appointment_update_trigger
on public.hospital_appointments;

create trigger protect_hospital_appointment_update_trigger
before update on public.hospital_appointments
for each row
execute function public.protect_hospital_appointment_update();
