-- MediBridge v7: consultation + prescription
-- Run once in Supabase SQL Editor before deploying v7.

create table if not exists public.consultations (
  id uuid primary key default gen_random_uuid(),

  appointment_id uuid not null unique
    references public.appointments(id)
    on delete cascade,

  doctor_id uuid not null
    references public.doctor_profiles(id)
    on delete restrict,

  patient_id uuid not null
    references public.patient_profiles(id)
    on delete restrict,

  clinical_notes text,
  assessment text,
  diagnosis text,
  investigations text,
  advice text,
  follow_up_date date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prescription_items (
  id uuid primary key default gen_random_uuid(),

  consultation_id uuid not null
    references public.consultations(id)
    on delete cascade,

  medicine_name text not null,
  strength text,
  dose text,
  frequency text,
  duration text,
  instructions text,

  created_at timestamptz not null default now()
);

alter table public.consultations enable row level security;
alter table public.prescription_items enable row level security;


-- Can current user view this consultation?
create or replace function public.can_access_consultation(target_consultation uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.consultations c
    where c.id = target_consultation
      and public.can_access_appointment(c.appointment_id)
  );
$$;


-- Can current user edit this consultation?
create or replace function public.can_edit_consultation(target_consultation uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.consultations c
    join public.appointments a on a.id = c.appointment_id
    where c.id = target_consultation
      and a.doctor_id = auth.uid()
      and a.status in ('booked','confirmed')
      and public.is_verified_doctor(auth.uid())
  );
$$;


-- Force consultation participants to match the appointment and allow
-- only the verified doctor assigned to the active appointment to write.
create or replace function public.prepare_consultation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  appt_doctor uuid;
  appt_patient uuid;
  appt_status text;
begin
  select doctor_id, patient_id, status
  into appt_doctor, appt_patient, appt_status
  from public.appointments
  where id = new.appointment_id;

  if appt_doctor is null then
    raise exception 'Appointment not found';
  end if;

  if auth.uid() <> appt_doctor then
    raise exception 'Only the assigned doctor can write this consultation';
  end if;

  if not public.is_verified_doctor(auth.uid()) then
    raise exception 'Doctor is not verified';
  end if;

  if appt_status not in ('booked','confirmed') then
    raise exception 'Consultation is read-only for this appointment status';
  end if;

  new.doctor_id := appt_doctor;
  new.patient_id := appt_patient;
  new.updated_at := now();

  return new;
end;
$$;

drop trigger if exists prepare_consultation_trigger
on public.consultations;

create trigger prepare_consultation_trigger
before insert or update on public.consultations
for each row
execute function public.prepare_consultation();


drop policy if exists "Participants can view consultations"
on public.consultations;

create policy "Participants can view consultations"
on public.consultations
for select
to authenticated
using (
  public.can_access_appointment(appointment_id)
);


drop policy if exists "Assigned doctor can create consultation"
on public.consultations;

create policy "Assigned doctor can create consultation"
on public.consultations
for insert
to authenticated
with check (
  auth.uid() = doctor_id
  and public.is_verified_doctor(auth.uid())
  and public.can_access_appointment(appointment_id)
);


drop policy if exists "Assigned doctor can update consultation"
on public.consultations;

create policy "Assigned doctor can update consultation"
on public.consultations
for update
to authenticated
using (
  auth.uid() = doctor_id
  and public.is_verified_doctor(auth.uid())
)
with check (
  auth.uid() = doctor_id
  and public.is_verified_doctor(auth.uid())
);


drop policy if exists "Participants can view prescription items"
on public.prescription_items;

create policy "Participants can view prescription items"
on public.prescription_items
for select
to authenticated
using (
  public.can_access_consultation(consultation_id)
);


drop policy if exists "Assigned doctor can add prescription items"
on public.prescription_items;

create policy "Assigned doctor can add prescription items"
on public.prescription_items
for insert
to authenticated
with check (
  public.can_edit_consultation(consultation_id)
);


drop policy if exists "Assigned doctor can update prescription items"
on public.prescription_items;

create policy "Assigned doctor can update prescription items"
on public.prescription_items
for update
to authenticated
using (
  public.can_edit_consultation(consultation_id)
)
with check (
  public.can_edit_consultation(consultation_id)
);


drop policy if exists "Assigned doctor can delete prescription items"
on public.prescription_items;

create policy "Assigned doctor can delete prescription items"
on public.prescription_items
for delete
to authenticated
using (
  public.can_edit_consultation(consultation_id)
);
