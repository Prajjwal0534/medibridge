-- MediBridge v11: patient consent + audited record access
-- Run once in Supabase SQL Editor before deploying v11.

create table if not exists public.record_consents (
  id uuid primary key default gen_random_uuid(),

  patient_id uuid not null
    references public.patient_profiles(id)
    on delete cascade,

  doctor_id uuid not null
    references public.doctor_profiles(id)
    on delete cascade,

  scopes text[] not null
    check (
      scopes <@ array[
        'consultations',
        'prescriptions',
        'appointment_files',
        'referrals',
        'emergency_summary'
      ]::text[]
    ),

  status text not null default 'active'
    check (status in ('active','revoked','expired')),

  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists record_consents_patient_idx
on public.record_consents(patient_id);

create index if not exists record_consents_doctor_idx
on public.record_consents(doctor_id);


create table if not exists public.record_access_log (
  id uuid primary key default gen_random_uuid(),

  patient_id uuid not null
    references public.patient_profiles(id)
    on delete cascade,

  accessor_id uuid not null
    references public.profiles(id)
    on delete restrict,

  access_type text not null
    check (access_type in (
      'consultations',
      'prescriptions',
      'appointment_files',
      'referrals',
      'emergency_summary',
      'record_overview'
    )),

  source text not null default 'consent'
    check (source in ('consent','referral','admin','emergency')),

  reference_id uuid,
  accessed_at timestamptz not null default now()
);

create index if not exists record_access_log_patient_idx
on public.record_access_log(patient_id, accessed_at desc);


alter table public.record_consents enable row level security;
alter table public.record_access_log enable row level security;


create or replace function public.has_record_consent(
  target_patient uuid,
  required_scope text
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.record_consents rc
    where rc.patient_id = target_patient
      and rc.doctor_id = auth.uid()
      and rc.status = 'active'
      and required_scope = any(rc.scopes)
      and (
        rc.expires_at is null
        or rc.expires_at > now()
      )
      and public.is_verified_doctor(auth.uid())
  );
$$;


-- Patient controls own consent rows.
drop policy if exists "Patients can view own record consents"
on public.record_consents;

create policy "Patients can view own record consents"
on public.record_consents
for select
to authenticated
using (
  patient_id = auth.uid()
  or doctor_id = auth.uid()
  or public.is_admin()
);


drop policy if exists "Patients can grant record consents"
on public.record_consents;

create policy "Patients can grant record consents"
on public.record_consents
for insert
to authenticated
with check (
  patient_id = auth.uid()
  and public.is_verified_doctor(doctor_id)
);


drop policy if exists "Patients can update own record consents"
on public.record_consents;

create policy "Patients can update own record consents"
on public.record_consents
for update
to authenticated
using (
  patient_id = auth.uid()
  or public.is_admin()
)
with check (
  patient_id = auth.uid()
  or public.is_admin()
);


-- Audit log visibility
drop policy if exists "Patients can view own access log"
on public.record_access_log;

create policy "Patients can view own access log"
on public.record_access_log
for select
to authenticated
using (
  patient_id = auth.uid()
  or accessor_id = auth.uid()
  or public.is_admin()
);


-- Only helper RPC below writes access logs.
revoke insert, update, delete on public.record_access_log from anon, authenticated;


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

grant execute on function public.log_record_access(
  uuid, text, text, uuid
) to authenticated;


-- Doctor can see completed appointments for a patient only with consultation consent.
drop policy if exists "Doctors can view consented patient appointments"
on public.appointments;

create policy "Doctors can view consented patient appointments"
on public.appointments
for select
to authenticated
using (
  (
    auth.uid() = patient_id
    or auth.uid() = doctor_id
    or public.is_admin()
  )
  or (
    status = 'completed'
    and public.has_record_consent(patient_id, 'consultations')
  )
);


-- Consultation visibility expands to active patient consent.
drop policy if exists "Participants or referral recipients can view consultations"
on public.consultations;

create policy "Participants referral recipients or consented doctors can view consultations"
on public.consultations
for select
to authenticated
using (
  public.can_access_appointment(appointment_id)
  or public.can_view_shared_appointment(appointment_id)
  or public.has_record_consent(patient_id, 'consultations')
);


-- Prescription visibility expands to active patient consent.
drop policy if exists "Participants can view prescription items"
on public.prescription_items;

create policy "Participants or consented doctors can view prescription items"
on public.prescription_items
for select
to authenticated
using (
  public.can_access_consultation(consultation_id)
  or exists (
    select 1
    from public.consultations c
    where c.id = consultation_id
      and public.has_record_consent(c.patient_id, 'prescriptions')
  )
);


-- Appointment-file metadata visibility expands to active patient consent.
drop policy if exists "Participants can view appointment files"
on public.appointment_files;

create policy "Participants or consented doctors can view appointment files"
on public.appointment_files
for select
to authenticated
using (
  public.can_access_appointment(appointment_id)
  or exists (
    select 1
    from public.appointments a
    where a.id = appointment_id
      and public.has_record_consent(a.patient_id, 'appointment_files')
  )
);


-- Storage download visibility expands to consented doctors.
drop policy if exists "Participants can view appointment storage"
on storage.objects;

create policy "Participants or consented doctors can view appointment storage"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'Appointment files'
  and (
    public.can_access_appointment(
      ((storage.foldername(name))[1])::uuid
    )
    or exists (
      select 1
      from public.appointments a
      where a.id = ((storage.foldername(name))[1])::uuid
        and public.has_record_consent(a.patient_id, 'appointment_files')
    )
  )
);


-- Referral visibility expands only if patient granted referrals scope.
drop policy if exists "Referral participants can view referrals"
on public.referrals;

create policy "Referral participants or consented doctors can view referrals"
on public.referrals
for select
to authenticated
using (
  patient_id = auth.uid()
  or from_doctor_id = auth.uid()
  or to_doctor_id = auth.uid()
  or public.is_admin()
  or public.has_record_consent(patient_id, 'referrals')
);
