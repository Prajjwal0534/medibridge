-- MediBridge v20.1.1 — SQL constraint fix
-- Run this instead of the previous v20-1-backend.sql.
-- Safe to run after v20-backend.sql and after the failed v20.1 attempt.

-- Add new columns first.
alter table public.video_consultation_sessions
  add column if not exists doctor_id uuid references public.profiles(id) on delete cascade,
  add column if not exists patient_id uuid references public.profiles(id) on delete cascade,
  add column if not exists doctor_started_at timestamptz,
  add column if not exists patient_notified_at timestamptz,
  add column if not exists patient_accepted_at timestamptz,
  add column if not exists connected_at timestamptz,
  add column if not exists declined_at timestamptz,
  add column if not exists missed_at timestamptz,
  add column if not exists started_by uuid references public.profiles(id) on delete set null;

update public.video_consultation_sessions s
set doctor_id = a.doctor_id,
    patient_id = a.patient_id
from public.appointments a
where a.id = s.appointment_id
  and (s.doctor_id is null or s.patient_id is null);

-- IMPORTANT FIX:
-- Remove the old constraint first, then translate old v20 statuses,
-- and only after that install the new v20.1 status constraint.
alter table public.video_consultation_sessions
  drop constraint if exists video_consultation_sessions_status_check;

update public.video_consultation_sessions
set status = case
  when status = 'open' then 'ended'
  when status = 'waiting' then 'idle'
  else status
end
where status in ('open','waiting');

alter table public.video_consultation_sessions
  add constraint video_consultation_sessions_status_check
  check (status in (
    'idle','calling','accepted','connecting','connected',
    'declined','missed','ended'
  ));

-- Enable Realtime publication once.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'video_consultation_sessions'
  ) then
    alter publication supabase_realtime
      add table public.video_consultation_sessions;
  end if;
end $$;

create index if not exists video_sessions_patient_status_idx
on public.video_consultation_sessions(patient_id, status);

create index if not exists video_sessions_doctor_status_idx
on public.video_consultation_sessions(doctor_id, status);

drop policy if exists "Appointment participants can view video session"
on public.video_consultation_sessions;

create policy "Appointment participants can view video session"
on public.video_consultation_sessions
for select to authenticated
using (
  patient_id = auth.uid()
  or doctor_id = auth.uid()
  or public.is_admin()
);

create or replace function public.get_video_consultation_session(
  target_appointment uuid
)
returns public.video_consultation_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  appt public.appointments%rowtype;
  session_row public.video_consultation_sessions%rowtype;
begin
  select * into appt
  from public.appointments
  where id = target_appointment;

  if not found then
    raise exception 'Appointment not found';
  end if;

  if not (
    appt.patient_id = auth.uid()
    or appt.doctor_id = auth.uid()
    or public.is_admin()
  ) then
    raise exception 'Not authorized for this appointment';
  end if;

  if appt.consultation_type <> 'online' then
    raise exception 'This is not an online appointment';
  end if;

  select * into session_row
  from public.video_consultation_sessions
  where appointment_id = target_appointment;

  return session_row;
end;
$$;

grant execute on function public.get_video_consultation_session(uuid)
to authenticated;

create or replace function public.start_video_consultation(
  target_appointment uuid
)
returns public.video_consultation_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  appt public.appointments%rowtype;
  session_row public.video_consultation_sessions%rowtype;
  new_room text;
begin
  if not public.is_verified_doctor(auth.uid()) then
    raise exception 'Verified doctor required';
  end if;

  select * into appt
  from public.appointments
  where id = target_appointment
    and doctor_id = auth.uid();

  if not found then
    raise exception 'Assigned appointment not found';
  end if;

  if appt.consultation_type <> 'online' then
    raise exception 'This is not an online appointment';
  end if;

  if appt.status not in ('booked','confirmed') then
    raise exception 'Appointment is not active';
  end if;

  new_room := 'medibridge-' || replace(gen_random_uuid()::text, '-', '');

  insert into public.video_consultation_sessions (
    appointment_id, room_name, status,
    doctor_id, patient_id,
    doctor_started_at, patient_notified_at,
    started_by, started_at,
    patient_accepted_at, patient_joined_at, doctor_joined_at,
    connected_at, declined_at, missed_at, ended_at,
    updated_at
  )
  values (
    target_appointment, new_room, 'calling',
    appt.doctor_id, appt.patient_id,
    now(), now(),
    auth.uid(), now(),
    null, null, null,
    null, null, null, null,
    now()
  )
  on conflict (appointment_id)
  do update set
    room_name = case
      when public.video_consultation_sessions.status in ('ended','declined','missed','idle')
        then new_room
      else public.video_consultation_sessions.room_name
    end,
    status = 'calling',
    doctor_id = appt.doctor_id,
    patient_id = appt.patient_id,
    doctor_started_at = now(),
    patient_notified_at = now(),
    started_by = auth.uid(),
    started_at = now(),
    patient_accepted_at = null,
    patient_joined_at = null,
    doctor_joined_at = null,
    connected_at = null,
    declined_at = null,
    missed_at = null,
    ended_at = null,
    updated_at = now()
  returning * into session_row;

  return session_row;
end;
$$;

grant execute on function public.start_video_consultation(uuid)
to authenticated;

create or replace function public.respond_video_consultation(
  target_appointment uuid,
  response_action text
)
returns public.video_consultation_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  appt public.appointments%rowtype;
  session_row public.video_consultation_sessions%rowtype;
begin
  select * into appt
  from public.appointments
  where id = target_appointment
    and patient_id = auth.uid();

  if not found then
    raise exception 'Patient appointment not found';
  end if;

  if response_action not in ('accept','decline') then
    raise exception 'Invalid response';
  end if;

  select * into session_row
  from public.video_consultation_sessions
  where appointment_id = target_appointment
  for update;

  if not found or session_row.status <> 'calling' then
    raise exception 'This call is no longer ringing';
  end if;

  if response_action = 'accept' then
    update public.video_consultation_sessions
    set status = 'accepted',
        patient_accepted_at = now(),
        updated_at = now()
    where appointment_id = target_appointment
    returning * into session_row;
  else
    update public.video_consultation_sessions
    set status = 'declined',
        declined_at = now(),
        updated_at = now()
    where appointment_id = target_appointment
    returning * into session_row;
  end if;

  return session_row;
end;
$$;

grant execute on function public.respond_video_consultation(uuid,text)
to authenticated;

create or replace function public.mark_video_consultation_joined(
  target_appointment uuid
)
returns public.video_consultation_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  appt public.appointments%rowtype;
  session_row public.video_consultation_sessions%rowtype;
begin
  select * into appt
  from public.appointments
  where id = target_appointment;

  if not found then
    raise exception 'Appointment not found';
  end if;

  if appt.patient_id <> auth.uid()
     and appt.doctor_id <> auth.uid()
     and not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  select * into session_row
  from public.video_consultation_sessions
  where appointment_id = target_appointment
  for update;

  if not found or session_row.status not in ('accepted','connecting','connected') then
    raise exception 'Call is not ready to join';
  end if;

  if appt.patient_id = auth.uid() then
    update public.video_consultation_sessions
    set patient_joined_at = coalesce(patient_joined_at, now()),
        status = case when doctor_joined_at is not null then 'connected' else 'connecting' end,
        connected_at = case
          when doctor_joined_at is not null then coalesce(connected_at, now())
          else connected_at
        end,
        updated_at = now()
    where appointment_id = target_appointment
    returning * into session_row;
  elsif appt.doctor_id = auth.uid() then
    update public.video_consultation_sessions
    set doctor_joined_at = coalesce(doctor_joined_at, now()),
        status = case when patient_joined_at is not null then 'connected' else 'connecting' end,
        connected_at = case
          when patient_joined_at is not null then coalesce(connected_at, now())
          else connected_at
        end,
        updated_at = now()
    where appointment_id = target_appointment
    returning * into session_row;
  end if;

  return session_row;
end;
$$;

grant execute on function public.mark_video_consultation_joined(uuid)
to authenticated;

create or replace function public.end_video_consultation(
  target_appointment uuid
)
returns public.video_consultation_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  appt public.appointments%rowtype;
  session_row public.video_consultation_sessions%rowtype;
begin
  if not public.is_verified_doctor(auth.uid()) then
    raise exception 'Verified doctor required';
  end if;

  select * into appt
  from public.appointments
  where id = target_appointment
    and doctor_id = auth.uid();

  if not found then
    raise exception 'Assigned appointment not found';
  end if;

  update public.video_consultation_sessions
  set status = 'ended',
      ended_at = now(),
      updated_at = now()
  where appointment_id = target_appointment
  returning * into session_row;

  if not found then
    raise exception 'Video session not found';
  end if;

  return session_row;
end;
$$;

grant execute on function public.end_video_consultation(uuid)
to authenticated;

create or replace function public.mark_video_consultation_missed(
  target_appointment uuid
)
returns public.video_consultation_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row public.video_consultation_sessions%rowtype;
begin
  if not exists (
    select 1
    from public.appointments a
    where a.id = target_appointment
      and a.doctor_id = auth.uid()
  ) then
    raise exception 'Assigned doctor required';
  end if;

  update public.video_consultation_sessions
  set status = 'missed',
      missed_at = now(),
      updated_at = now()
  where appointment_id = target_appointment
    and status = 'calling'
  returning * into session_row;

  return session_row;
end;
$$;

grant execute on function public.mark_video_consultation_missed(uuid)
to authenticated;
