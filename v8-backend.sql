-- MediBridge v8: referrals + patient-controlled record sharing
-- Run once in Supabase SQL Editor before deploying v8.

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),

  patient_id uuid not null
    references public.patient_profiles(id)
    on delete restrict,

  from_doctor_id uuid not null
    references public.doctor_profiles(id)
    on delete restrict,

  to_doctor_id uuid not null
    references public.doctor_profiles(id)
    on delete restrict,

  source_appointment_id uuid not null
    references public.appointments(id)
    on delete restrict,

  reason text not null,
  note text,

  status text not null default 'proposed'
    check (status in (
      'proposed',
      'patient_approved',
      'accepted',
      'declined',
      'completed',
      'cancelled'
    )),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (from_doctor_id <> to_doctor_id)
);


create table if not exists public.referral_shared_appointments (
  referral_id uuid not null
    references public.referrals(id)
    on delete cascade,

  appointment_id uuid not null
    references public.appointments(id)
    on delete cascade,

  shared_by uuid not null
    references public.profiles(id)
    on delete restrict,

  created_at timestamptz not null default now(),

  primary key (referral_id, appointment_id)
);


alter table public.referrals enable row level security;
alter table public.referral_shared_appointments enable row level security;


create or replace function public.can_access_referral(target_referral uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.referrals r
    where r.id = target_referral
      and (
        r.patient_id = auth.uid()
        or r.from_doctor_id = auth.uid()
        or r.to_doctor_id = auth.uid()
        or public.is_admin()
      )
  );
$$;


create or replace function public.can_view_shared_appointment(target_appointment uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.referral_shared_appointments rsa
    join public.referrals r on r.id = rsa.referral_id
    where rsa.appointment_id = target_appointment
      and r.to_doctor_id = auth.uid()
      and r.status in ('patient_approved','accepted','completed')
      and public.is_verified_doctor(auth.uid())
  );
$$;


-- Create referrals only from the assigned verified doctor.
create or replace function public.validate_referral_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a_patient uuid;
  a_doctor uuid;
begin
  select patient_id, doctor_id
  into a_patient, a_doctor
  from public.appointments
  where id = new.source_appointment_id;

  if a_patient is null then
    raise exception 'Source appointment not found';
  end if;

  if auth.uid() <> a_doctor
     or auth.uid() <> new.from_doctor_id
     or new.patient_id <> a_patient then
    raise exception 'Referral participants do not match the source appointment';
  end if;

  if not public.is_verified_doctor(new.from_doctor_id)
     or not public.is_verified_doctor(new.to_doctor_id) then
    raise exception 'Both doctors must be verified';
  end if;

  new.status := 'proposed';
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists validate_referral_insert_trigger on public.referrals;

create trigger validate_referral_insert_trigger
before insert on public.referrals
for each row
execute function public.validate_referral_insert();


-- Restrict referral status transitions.
create or replace function public.protect_referral_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    new.updated_at := now();
    return new;
  end if;

  if new.patient_id is distinct from old.patient_id
     or new.from_doctor_id is distinct from old.from_doctor_id
     or new.to_doctor_id is distinct from old.to_doctor_id
     or new.source_appointment_id is distinct from old.source_appointment_id
     or new.reason is distinct from old.reason
     or new.note is distinct from old.note then
    raise exception 'Referral core details cannot be changed';
  end if;

  if auth.uid() = old.patient_id then
    if old.status = 'proposed'
       and new.status not in ('patient_approved','cancelled') then
      raise exception 'Patient may approve or cancel this referral';
    elsif old.status <> 'proposed'
       and new.status is distinct from old.status
       and new.status <> 'cancelled' then
      raise exception 'Invalid patient referral status change';
    end if;

  elsif auth.uid() = old.to_doctor_id then
    if old.status = 'patient_approved'
       and new.status not in ('accepted','declined') then
      raise exception 'Receiving doctor may accept or decline';
    elsif old.status = 'accepted'
       and new.status <> 'completed' then
      raise exception 'Receiving doctor may complete an accepted referral';
    elsif new.status is distinct from old.status then
      raise exception 'Invalid receiving doctor status change';
    end if;

  elsif auth.uid() = old.from_doctor_id then
    if old.status = 'proposed' and new.status <> 'cancelled' then
      raise exception 'Referring doctor may only cancel a proposed referral';
    elsif new.status is distinct from old.status then
      raise exception 'Invalid referring doctor status change';
    end if;

  else
    raise exception 'Not allowed to update this referral';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_referral_update_trigger on public.referrals;

create trigger protect_referral_update_trigger
before update on public.referrals
for each row
execute function public.protect_referral_update();


drop policy if exists "Referral participants can view referrals" on public.referrals;
create policy "Referral participants can view referrals"
on public.referrals
for select
to authenticated
using (
  patient_id = auth.uid()
  or from_doctor_id = auth.uid()
  or to_doctor_id = auth.uid()
  or public.is_admin()
);


drop policy if exists "Verified doctor can create referral" on public.referrals;
create policy "Verified doctor can create referral"
on public.referrals
for insert
to authenticated
with check (
  from_doctor_id = auth.uid()
  and public.is_verified_doctor(auth.uid())
);


drop policy if exists "Referral participants can update status" on public.referrals;
create policy "Referral participants can update status"
on public.referrals
for update
to authenticated
using (
  patient_id = auth.uid()
  or from_doctor_id = auth.uid()
  or to_doctor_id = auth.uid()
  or public.is_admin()
)
with check (
  patient_id = auth.uid()
  or from_doctor_id = auth.uid()
  or to_doctor_id = auth.uid()
  or public.is_admin()
);


-- Patient controls which past appointments are shared.
drop policy if exists "Referral participants can view shared record links"
on public.referral_shared_appointments;

create policy "Referral participants can view shared record links"
on public.referral_shared_appointments
for select
to authenticated
using (
  public.can_access_referral(referral_id)
);


drop policy if exists "Patient can share own appointments"
on public.referral_shared_appointments;

create policy "Patient can share own appointments"
on public.referral_shared_appointments
for insert
to authenticated
with check (
  shared_by = auth.uid()
  and exists (
    select 1
    from public.referrals r
    join public.appointments a on a.id = appointment_id
    where r.id = referral_id
      and r.patient_id = auth.uid()
      and a.patient_id = auth.uid()
      and a.status = 'completed'
  )
);


drop policy if exists "Patient can remove shared appointments"
on public.referral_shared_appointments;

create policy "Patient can remove shared appointments"
on public.referral_shared_appointments
for delete
to authenticated
using (
  shared_by = auth.uid()
  and exists (
    select 1
    from public.referrals r
    where r.id = referral_id
      and r.patient_id = auth.uid()
      and r.status = 'proposed'
  )
);


-- Expand consultation visibility to explicitly shared referral records.
drop policy if exists "Participants can view consultations"
on public.consultations;

create policy "Participants or referral recipients can view consultations"
on public.consultations
for select
to authenticated
using (
  public.can_access_appointment(appointment_id)
  or public.can_view_shared_appointment(appointment_id)
);


-- Update consultation access helper so prescription items follow the same consent.
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
      and (
        public.can_access_appointment(c.appointment_id)
        or public.can_view_shared_appointment(c.appointment_id)
      )
  );
$$;
