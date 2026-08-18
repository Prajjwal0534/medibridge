-- MediBridge v20 — Online / Video Consultation Workflow
-- Run once in Supabase SQL Editor.

create table if not exists public.video_consultation_sessions (
  appointment_id uuid primary key references public.appointments(id) on delete cascade,
  room_name text not null unique,
  status text not null default 'waiting'
    check (status in ('waiting','open','ended')),
  patient_joined_at timestamptz,
  doctor_joined_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.video_consultation_sessions enable row level security;

create or replace function public.can_access_video_session(target_appointment uuid)
returns boolean
language sql
stable
security definer
set search_path = public
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

revoke all on function public.can_access_video_session(uuid) from public;
grant execute on function public.can_access_video_session(uuid) to authenticated;

drop policy if exists "Appointment participants can view video session"
on public.video_consultation_sessions;

create policy "Appointment participants can view video session"
on public.video_consultation_sessions
for select to authenticated
using (public.can_access_video_session(appointment_id));

-- Direct client writes are intentionally not allowed.
-- The RPCs below validate the role and appointment before changing session state.

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
  select *
  into appt
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

  select *
  into session_row
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
begin
  if not public.is_verified_doctor(auth.uid()) then
    raise exception 'Verified doctor required';
  end if;

  select *
  into appt
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

  insert into public.video_consultation_sessions (
    appointment_id,
    room_name,
    status,
    started_at,
    doctor_joined_at,
    updated_at
  )
  values (
    target_appointment,
    'medibridge-' || replace(gen_random_uuid()::text, '-', ''),
    'open',
    now(),
    now(),
    now()
  )
  on conflict (appointment_id)
  do update set
    status = case
      when public.video_consultation_sessions.status = 'ended'
        then public.video_consultation_sessions.status
      else 'open'
    end,
    started_at = coalesce(public.video_consultation_sessions.started_at, now()),
    doctor_joined_at = now(),
    updated_at = now()
  returning *
  into session_row;

  if session_row.status = 'ended' then
    raise exception 'This video session has already ended';
  end if;

  return session_row;
end;
$$;

grant execute on function public.start_video_consultation(uuid)
to authenticated;


create or replace function public.join_video_consultation(
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
  select *
  into appt
  from public.appointments
  where id = target_appointment;

  if not found then
    raise exception 'Appointment not found';
  end if;

  if appt.consultation_type <> 'online' then
    raise exception 'This is not an online appointment';
  end if;

  if appt.status not in ('booked','confirmed') then
    raise exception 'Appointment is not active';
  end if;

  select *
  into session_row
  from public.video_consultation_sessions
  where appointment_id = target_appointment;

  if not found or session_row.status <> 'open' then
    raise exception 'The doctor has not started the video consultation yet';
  end if;

  if appt.patient_id = auth.uid() then
    update public.video_consultation_sessions
    set patient_joined_at = now(),
        updated_at = now()
    where appointment_id = target_appointment
    returning * into session_row;
  elsif appt.doctor_id = auth.uid() then
    update public.video_consultation_sessions
    set doctor_joined_at = now(),
        updated_at = now()
    where appointment_id = target_appointment
    returning * into session_row;
  elsif not public.is_admin() then
    raise exception 'Not authorized for this appointment';
  end if;

  return session_row;
end;
$$;

grant execute on function public.join_video_consultation(uuid)
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

  select *
  into appt
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
