-- MediBridge v9.5: automatic clinic GPS fields

alter table public.doctor_profiles
add column if not exists clinic_latitude numeric;

alter table public.doctor_profiles
add column if not exists clinic_longitude numeric;

alter table public.doctor_profiles
drop constraint if exists doctor_profiles_valid_coordinates;

alter table public.doctor_profiles
add constraint doctor_profiles_valid_coordinates
check (
  (clinic_latitude is null and clinic_longitude is null)
  or (
    clinic_latitude between -90 and 90
    and clinic_longitude between -180 and 180
  )
);
