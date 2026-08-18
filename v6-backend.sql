-- MediBridge v6: appointment management + shared private files
-- Run this once in Supabase SQL Editor BEFORE deploying v6.

-- Helper: can the logged-in user access an appointment?
create or replace function public.can_access_appointment(target_appointment uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.appointments a
    where a.id = target_appointment
      and (
        a.patient_id = auth.uid()
        or a.doctor_id = auth.uid()
        or public.is_admin()
      )
  );
$$;

-- Lock down sensitive appointment fields on UPDATE.
-- Patient and doctor can cancel, but cannot rewrite participants or appointment time.
create or replace function public.protect_appointment_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  my_role text;
begin
  if public.is_admin() then
    return new;
  end if;

  select role into my_role
  from public.profiles
  where id = auth.uid();

  if new.patient_id is distinct from old.patient_id
     or new.doctor_id is distinct from old.doctor_id
     or new.appointment_start is distinct from old.appointment_start
     or new.appointment_end is distinct from old.appointment_end
     or new.consultation_type is distinct from old.consultation_type
     or new.reason_for_visit is distinct from old.reason_for_visit then
    raise exception 'Appointment core details cannot be changed here';
  end if;

  if my_role = 'patient' then
    if auth.uid() <> old.patient_id then
      raise exception 'Not your appointment';
    end if;

    if new.status is distinct from old.status
       and new.status <> 'cancelled' then
      raise exception 'Patients may only cancel appointments';
    end if;

  elsif my_role = 'doctor' then
    if auth.uid() <> old.doctor_id then
      raise exception 'Not your appointment';
    end if;

    if new.status is distinct from old.status
       and new.status not in ('confirmed','completed','cancelled','no_show') then
      raise exception 'Invalid doctor appointment status';
    end if;

  else
    raise exception 'Not allowed to update appointments';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_appointment_update_trigger
on public.appointments;

create trigger protect_appointment_update_trigger
before update on public.appointments
for each row
execute function public.protect_appointment_update();


-- Appointment file metadata
create table if not exists public.appointment_files (
  id uuid primary key default gen_random_uuid(),

  appointment_id uuid not null
    references public.appointments(id)
    on delete cascade,

  uploader_id uuid not null
    references public.profiles(id)
    on delete restrict,

  file_name text not null,
  file_path text not null unique,
  mime_type text,
  file_size bigint,

  created_at timestamptz not null default now()
);

alter table public.appointment_files enable row level security;

drop policy if exists "Participants can view appointment files"
on public.appointment_files;

create policy "Participants can view appointment files"
on public.appointment_files
for select
to authenticated
using (
  public.can_access_appointment(appointment_id)
);

drop policy if exists "Participants can add appointment files"
on public.appointment_files;

create policy "Participants can add appointment files"
on public.appointment_files
for insert
to authenticated
with check (
  uploader_id = auth.uid()
  and public.can_access_appointment(appointment_id)
);

drop policy if exists "Uploaders can delete their appointment files"
on public.appointment_files;

create policy "Uploaders can delete their appointment files"
on public.appointment_files
for delete
to authenticated
using (
  uploader_id = auth.uid()
  or public.is_admin()
);


-- Create private Storage bucket if it does not already exist.
insert into storage.buckets (id, name, public, file_size_limit)
values (
  'Appointment files',
  'Appointment files',
  false,
  10485760
)
on conflict (id) do update
set public = false,
    file_size_limit = 10485760;


-- Storage path:
-- Appointment files/<appointment-id>/<uploader-user-id>/<timestamp>_<filename>

drop policy if exists "Participants can upload appointment files"
on storage.objects;

create policy "Participants can upload appointment files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'Appointment files'
  and (storage.foldername(name))[2] = auth.uid()::text
  and public.can_access_appointment(
    ((storage.foldername(name))[1])::uuid
  )
);

drop policy if exists "Participants can view appointment storage"
on storage.objects;

create policy "Participants can view appointment storage"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'Appointment files'
  and public.can_access_appointment(
    ((storage.foldername(name))[1])::uuid
  )
);

drop policy if exists "Uploaders can delete appointment storage"
on storage.objects;

create policy "Uploaders can delete appointment storage"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'Appointment files'
  and (
    (storage.foldername(name))[2] = auth.uid()::text
    or public.is_admin()
  )
);
