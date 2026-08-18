-- MediBridge v23 — Specialist Referral & Care Pathway
-- Run after previous backend migrations.

alter table public.referrals
  add column if not exists specialty_requested text,
  add column if not exists urgency text not null default 'routine',
  add column if not exists booked_appointment_id uuid references public.appointments(id) on delete set null,
  add column if not exists booked_at timestamptz;

alter table public.referrals
  drop constraint if exists referrals_urgency_check;

alter table public.referrals
  add constraint referrals_urgency_check
  check (urgency in ('routine','priority','urgent'));

alter table public.referrals
  drop constraint if exists referrals_status_check;

alter table public.referrals
  add constraint referrals_status_check
  check (status in (
    'proposed','patient_approved','accepted','booked',
    'declined','completed','cancelled'
  ));

-- Safe specialist directory for referral creation.
create or replace function public.get_verified_referral_doctors()
returns table(
  id uuid,
  full_name text,
  specialty text,
  qualification text,
  hospital_name text,
  clinic_city text,
  clinic_district text
)
language sql
stable
security definer
set search_path=public
as $$
  select
    d.id,
    p.full_name,
    d.specialty,
    d.qualification,
    d.hospital_name,
    d.clinic_city,
    d.clinic_district
  from public.doctor_profiles d
  join public.profiles p on p.id=d.id
  where p.role='doctor'
    and p.verification_status='verified'
    and d.id <> auth.uid()
  order by d.specialty nulls last,p.full_name;
$$;

revoke all on function public.get_verified_referral_doctors() from public;
grant execute on function public.get_verified_referral_doctors() to authenticated;

-- Safe doctor details for a patient booking an accepted referral.
create or replace function public.get_referral_booking_doctor(target_referral uuid)
returns table(
  id uuid,
  full_name text,
  specialty text,
  qualification text,
  hospital_name text,
  clinic_city text,
  clinic_district text,
  google_maps_url text,
  clinic_latitude double precision,
  clinic_longitude double precision
)
language sql
stable
security definer
set search_path=public
as $$
  select
    d.id,p.full_name,d.specialty,d.qualification,d.hospital_name,
    d.clinic_city,d.clinic_district,d.google_maps_url,
    d.clinic_latitude,d.clinic_longitude
  from public.referrals r
  join public.doctor_profiles d on d.id=r.to_doctor_id
  join public.profiles p on p.id=d.id
  where r.id=target_referral
    and r.patient_id=auth.uid()
    and r.status in ('accepted','booked');
$$;

revoke all on function public.get_referral_booking_doctor(uuid) from public;
grant execute on function public.get_referral_booking_doctor(uuid) to authenticated;

-- Upgrade referral insert validation to populate specialist metadata.
create or replace function public.validate_referral_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a_patient uuid;
  a_doctor uuid;
  target_specialty text;
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

  select specialty into target_specialty
  from public.doctor_profiles
  where id=new.to_doctor_id;

  new.specialty_requested := coalesce(nullif(trim(new.specialty_requested),''),target_specialty);
  new.urgency := coalesce(new.urgency,'routine');
  new.status := 'proposed';
  new.booked_appointment_id := null;
  new.booked_at := null;
  new.updated_at := now();
  return new;
end;
$$;

-- Protect referral updates including the new booking fields.
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
     or new.note is distinct from old.note
     or new.specialty_requested is distinct from old.specialty_requested
     or new.urgency is distinct from old.urgency then
    raise exception 'Referral core details cannot be changed';
  end if;

  -- Booking linkage is handled only by the secure RPC/appointment trigger.
  if (new.booked_appointment_id is distinct from old.booked_appointment_id
      or new.booked_at is distinct from old.booked_at)
     and current_setting('medibridge.referral_booking_update',true) is distinct from 'allowed' then
    raise exception 'Referral booking must be linked through the booking pathway';
  end if;

  if auth.uid() = old.patient_id then
    if old.status = 'proposed'
       and new.status not in ('patient_approved','cancelled') then
      raise exception 'Patient may approve or cancel this referral';
    elsif old.status in ('patient_approved','accepted','booked')
       and new.status is distinct from old.status
       and new.status <> 'cancelled' then
      raise exception 'Invalid patient referral status change';
    elsif old.status not in ('proposed','patient_approved','accepted','booked')
       and new.status is distinct from old.status then
      raise exception 'Invalid patient referral status change';
    end if;

  elsif auth.uid() = old.to_doctor_id then
    if old.status = 'patient_approved'
       and new.status not in ('accepted','declined') then
      raise exception 'Receiving doctor may accept or decline';
    elsif old.status in ('accepted','booked')
       and new.status <> 'completed'
       and new.status is distinct from old.status then
      raise exception 'Receiving doctor may complete an accepted/booked referral';
    elsif new.status is distinct from old.status
       and old.status not in ('patient_approved','accepted','booked') then
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

-- Patient links a newly-booked appointment to the accepted referral.
create or replace function public.link_referral_appointment(
  target_referral uuid,
  target_appointment uuid
)
returns public.referrals
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.referrals%rowtype;
  a public.appointments%rowtype;
begin
  select * into r
  from public.referrals
  where id=target_referral
    and patient_id=auth.uid()
  for update;

  if not found then
    raise exception 'Referral not found';
  end if;

  if r.status <> 'accepted' then
    raise exception 'Referral must be accepted before booking';
  end if;

  select * into a
  from public.appointments
  where id=target_appointment
    and patient_id=auth.uid()
    and doctor_id=r.to_doctor_id;

  if not found then
    raise exception 'Booked appointment does not match the referred specialist';
  end if;

  perform set_config('medibridge.referral_booking_update','allowed',true);

  update public.referrals
  set booked_appointment_id=target_appointment,
      booked_at=now(),
      status='booked',
      updated_at=now()
  where id=target_referral
  returning * into r;

  return r;
end;
$$;

grant execute on function public.link_referral_appointment(uuid,uuid)
to authenticated;

-- Automatically close the referral pathway when the linked specialist appointment completes.
create or replace function public.complete_linked_referral()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.status='completed' and old.status is distinct from new.status then
    perform set_config('medibridge.referral_booking_update','allowed',true);

    update public.referrals
    set status='completed',updated_at=now()
    where booked_appointment_id=new.id
      and status='booked';
  end if;

  return new;
end;
$$;

drop trigger if exists complete_linked_referral_trigger on public.appointments;
create trigger complete_linked_referral_trigger
after update of status on public.appointments
for each row
execute function public.complete_linked_referral();

create index if not exists referrals_patient_status_idx
on public.referrals(patient_id,status,created_at desc);

create index if not exists referrals_booked_appointment_idx
on public.referrals(booked_appointment_id);
