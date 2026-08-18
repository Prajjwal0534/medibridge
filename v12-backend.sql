-- MediBridge v12: longitudinal structured patient health record
-- Run once in Supabase SQL Editor before deploying v12.

-- Expand consent scopes
alter table public.record_consents
drop constraint if exists record_consents_scopes_check;

alter table public.record_consents
add constraint record_consents_scopes_check
check (
  scopes <@ array[
    'consultations',
    'prescriptions',
    'appointment_files',
    'referrals',
    'emergency_summary',
    'health_profile',
    'vitals'
  ]::text[]
);

-- Expand audit access types
alter table public.record_access_log
drop constraint if exists record_access_log_access_type_check;

alter table public.record_access_log
add constraint record_access_log_access_type_check
check (
  access_type in (
    'consultations',
    'prescriptions',
    'appointment_files',
    'referrals',
    'emergency_summary',
    'health_profile',
    'vitals',
    'record_overview'
  )
);


create table if not exists public.patient_allergies (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  allergen text not null,
  reaction text,
  severity text check (severity is null or severity in ('mild','moderate','severe')),
  status text not null default 'active' check (status in ('active','resolved')),
  created_at timestamptz not null default now()
);

create table if not exists public.patient_conditions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  condition_name text not null,
  diagnosed_on date,
  status text not null default 'active' check (status in ('active','resolved','history')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.patient_medications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  medicine_name text not null,
  strength text,
  dose text,
  frequency text,
  started_on date,
  ended_on date,
  status text not null default 'active' check (status in ('active','stopped','completed')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.patient_surgeries (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  procedure_name text not null,
  procedure_date date,
  hospital_name text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.patient_immunizations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  vaccine_name text not null,
  dose_label text,
  administered_on date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.patient_family_history (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  relation text not null,
  condition_name text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.patient_vitals (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  measured_at timestamptz not null default now(),
  systolic integer check (systolic is null or systolic between 40 and 300),
  diastolic integer check (diastolic is null or diastolic between 20 and 200),
  pulse integer check (pulse is null or pulse between 20 and 250),
  temperature_c numeric check (temperature_c is null or temperature_c between 25 and 45),
  spo2 integer check (spo2 is null or spo2 between 50 and 100),
  weight_kg numeric check (weight_kg is null or weight_kg between 1 and 500),
  height_cm numeric check (height_cm is null or height_cm between 30 and 260),
  source text not null default 'patient' check (source in ('patient','doctor','hospital','device')),
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table public.patient_allergies enable row level security;
alter table public.patient_conditions enable row level security;
alter table public.patient_medications enable row level security;
alter table public.patient_surgeries enable row level security;
alter table public.patient_immunizations enable row level security;
alter table public.patient_family_history enable row level security;
alter table public.patient_vitals enable row level security;

-- Helper policies for structured tables
do $$
declare
  t text;
begin
  foreach t in array array[
    'patient_allergies',
    'patient_conditions',
    'patient_medications',
    'patient_surgeries',
    'patient_immunizations',
    'patient_family_history'
  ]
  loop
    execute format('drop policy if exists "Patient can view own %1$s" on public.%1$I', t);
    execute format(
      'create policy "Patient can view own %1$s" on public.%1$I for select to authenticated using (patient_id = auth.uid() or public.has_record_consent(patient_id, ''health_profile'') or public.is_admin())',
      t
    );

    execute format('drop policy if exists "Patient can add own %1$s" on public.%1$I', t);
    execute format(
      'create policy "Patient can add own %1$s" on public.%1$I for insert to authenticated with check (patient_id = auth.uid())',
      t
    );

    execute format('drop policy if exists "Patient can update own %1$s" on public.%1$I', t);
    execute format(
      'create policy "Patient can update own %1$s" on public.%1$I for update to authenticated using (patient_id = auth.uid()) with check (patient_id = auth.uid())',
      t
    );

    execute format('drop policy if exists "Patient can delete own %1$s" on public.%1$I', t);
    execute format(
      'create policy "Patient can delete own %1$s" on public.%1$I for delete to authenticated using (patient_id = auth.uid())',
      t
    );
  end loop;
end
$$;

drop policy if exists "Patient or consented doctor can view vitals"
on public.patient_vitals;

create policy "Patient or consented doctor can view vitals"
on public.patient_vitals
for select
to authenticated
using (
  patient_id = auth.uid()
  or public.has_record_consent(patient_id, 'vitals')
  or public.is_admin()
);

drop policy if exists "Patient can add own vitals"
on public.patient_vitals;

create policy "Patient can add own vitals"
on public.patient_vitals
for insert
to authenticated
with check (patient_id = auth.uid());

drop policy if exists "Patient can update own vitals"
on public.patient_vitals;

create policy "Patient can update own vitals"
on public.patient_vitals
for update
to authenticated
using (patient_id = auth.uid())
with check (patient_id = auth.uid());

drop policy if exists "Patient can delete own vitals"
on public.patient_vitals;

create policy "Patient can delete own vitals"
on public.patient_vitals
for delete
to authenticated
using (patient_id = auth.uid());

-- Allow consent audit helper to accept new access types
create or replace function public.log_record_access(
  target_patient uuid,
  requested_scope text,
  source_name text default 'consent',
  source_reference uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if requested_scope not in (
    'consultations',
    'prescriptions',
    'appointment_files',
    'referrals',
    'emergency_summary',
    'health_profile',
    'vitals',
    'record_overview'
  ) then
    raise exception 'Invalid record access type';
  end if;

  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not (
    auth.uid() = target_patient
    or public.is_admin()
    or (
      requested_scope = 'record_overview'
      and exists (
        select 1 from public.record_consents rc
        where rc.patient_id = target_patient
          and rc.doctor_id = auth.uid()
          and rc.status = 'active'
          and (rc.expires_at is null or rc.expires_at > now())
      )
    )
    or public.has_record_consent(target_patient, requested_scope)
  ) then
    raise exception 'No active patient consent for this record type';
  end if;

  insert into public.record_access_log (
    patient_id,
    accessor_id,
    access_type,
    source,
    reference_id
  )
  values (
    target_patient,
    auth.uid(),
    requested_scope,
    source_name,
    source_reference
  );
end;
$$;
