-- MediBridge v9.2: maps links + district fallback
alter table public.hospital_profiles
add column if not exists district text;

alter table public.hospital_profiles
add column if not exists google_maps_url text;

alter table public.doctor_profiles
add column if not exists google_maps_url text;
