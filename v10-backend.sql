-- MediBridge v10: hospital operations + emergency arrival notices
-- Run once in Supabase SQL Editor before deploying v10.

create table if not exists public.emergency_arrival_requests (
  id uuid primary key default gen_random_uuid(),

  patient_id uuid not null
    references public.patient_profiles(id)
    on delete restrict,

  hospital_id uuid not null
    references public.hospital_profiles(id)
    on delete restrict,

  emergency_type text not null
    check (emergency_type in (
      'general',
      'trauma',
      'cardiac',
      'stroke',
      'maternity',
      'pediatric'
    )),

  eta_minutes integer
    check (eta_minutes is null or eta_minutes between 1 and 240),

  note text,

  status text not null default 'sent'
    check (status in (
      'sent',
      'acknowledged',
      'arrived',
      'closed',
      'cancelled'
    )),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.emergency_arrival_requests enable row level security;


drop policy if exists "Patients can view own emergency arrivals"
on public.emergency_arrival_requests;

create policy "Patients can view own emergency arrivals"
on public.emergency_arrival_requests
for select
to authenticated
using (
  patient_id = auth.uid()
);


drop policy if exists "Hospitals can view own emergency arrivals"
on public.emergency_arrival_requests;

create policy "Hospitals can view own emergency arrivals"
on public.emergency_arrival_requests
for select
to authenticated
using (
  hospital_id = auth.uid()
  and public.is_verified_hospital(auth.uid())
);


drop policy if exists "Admins can view emergency arrivals"
on public.emergency_arrival_requests;

create policy "Admins can view emergency arrivals"
on public.emergency_arrival_requests
for select
to authenticated
using (
  public.is_admin()
);


drop policy if exists "Patients can create emergency arrivals"
on public.emergency_arrival_requests;

create policy "Patients can create emergency arrivals"
on public.emergency_arrival_requests
for insert
to authenticated
with check (
  patient_id = auth.uid()
  and public.is_verified_hospital(hospital_id)
);


drop policy if exists "Patients can update own emergency arrivals"
on public.emergency_arrival_requests;

create policy "Patients can update own emergency arrivals"
on public.emergency_arrival_requests
for update
to authenticated
using (
  patient_id = auth.uid()
)
with check (
  patient_id = auth.uid()
);


drop policy if exists "Hospitals can update emergency arrivals"
on public.emergency_arrival_requests;

create policy "Hospitals can update emergency arrivals"
on public.emergency_arrival_requests
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


create or replace function public.protect_emergency_arrival_update()
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
     or new.emergency_type is distinct from old.emergency_type
     or new.eta_minutes is distinct from old.eta_minutes
     or new.note is distinct from old.note then
    raise exception 'Emergency arrival core details cannot be changed';
  end if;

  if my_role = 'patient' then
    if auth.uid() <> old.patient_id then
      raise exception 'Not your emergency arrival notice';
    end if;

    if new.status is distinct from old.status
       and new.status <> 'cancelled' then
      raise exception 'Patients may only cancel an emergency arrival notice';
    end if;

  elsif my_role = 'hospital' then
    if auth.uid() <> old.hospital_id then
      raise exception 'Not your hospital emergency arrival notice';
    end if;

    if new.status is distinct from old.status
       and new.status not in ('acknowledged','arrived','closed','cancelled') then
      raise exception 'Invalid hospital emergency arrival status';
    end if;

  else
    raise exception 'Not allowed';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_emergency_arrival_update_trigger
on public.emergency_arrival_requests;

create trigger protect_emergency_arrival_update_trigger
before update on public.emergency_arrival_requests
for each row
execute function public.protect_emergency_arrival_update();
