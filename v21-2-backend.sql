-- MediBridge v21.2 — Location-gated discovery
-- Run after v21.1.

-- Doctors need explicit city/district metadata so patients can search by location
-- without requiring GPS coordinates.
alter table public.doctor_profiles
  add column if not exists clinic_city text,
  add column if not exists clinic_district text;

create index if not exists doctor_profiles_clinic_city_idx
on public.doctor_profiles (lower(clinic_city));

create index if not exists doctor_profiles_clinic_district_idx
on public.doctor_profiles (lower(clinic_district));
