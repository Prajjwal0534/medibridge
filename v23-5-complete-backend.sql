-- MediBridge v23.5 COMPLETE backend
-- This combined script includes v23.4 + v23.5 changes in order.

-- MediBridge v23.4 — Referral no-show + rebooking
-- Run after v23-3-backend.sql.
--
-- A specialist appointment marked no_show must NOT complete the referral.
-- The referral moves to appointment_missed and can be rebooked.

alter table public.referrals
  drop constraint if exists referrals_status_check;

alter table public.referrals
  add constraint referrals_status_check
  check (status in (
    'proposed','patient_approved','accepted','booked',
    'appointment_missed','declined','completed','cancelled'
  ));

create or replace function public.protect_referral_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_override boolean :=
    current_setting('medibridge.referral_booking_update',true) = 'allowed';
  completion_override boolean :=
    current_setting('medibridge.referral_completion_update',true) = 'allowed';
  missed_override boolean :=
    current_setting('medibridge.referral_missed_update',true) = 'allowed';
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

  if (new.booked_appointment_id is distinct from old.booked_appointment_id
      or new.booked_at is distinct from old.booked_at)
     and not booking_override
     and not missed_override then
    raise exception 'Referral appointment linkage must use the secure pathway';
  end if;

  if booking_override then
    if old.status not in ('accepted','appointment_missed')
       or new.status <> 'booked'
       or new.booked_appointment_id is null then
      raise exception 'Invalid internal referral booking transition';
    end if;
    new.updated_at := now();
    return new;
  end if;

  if completion_override then
    if old.status <> 'booked' or new.status <> 'completed' then
      raise exception 'Invalid internal referral completion transition';
    end if;
    new.updated_at := now();
    return new;
  end if;

  if missed_override then
    if old.status <> 'booked' or new.status <> 'appointment_missed' then
      raise exception 'Invalid internal referral no-show transition';
    end if;
    new.updated_at := now();
    return new;
  end if;

  if new.status='completed' and old.status is distinct from new.status then
    raise exception 'Complete the linked specialist appointment. The referral will close automatically.';
  end if;

  if auth.uid() = old.patient_id then
    if old.status = 'proposed'
       and new.status not in ('patient_approved','cancelled') then
      raise exception 'Patient may approve or cancel this referral';
    elsif old.status in ('patient_approved','accepted','booked','appointment_missed')
       and new.status is distinct from old.status
       and new.status <> 'cancelled' then
      raise exception 'Use the referral booking pathway to change appointment state';
    elsif old.status not in ('proposed','patient_approved','accepted','booked','appointment_missed')
       and new.status is distinct from old.status then
      raise exception 'Invalid patient referral status change';
    end if;

  elsif auth.uid() = old.to_doctor_id then
    if old.status = 'patient_approved'
       and new.status not in ('accepted','declined') then
      raise exception 'Receiving doctor may accept or decline';
    elsif old.status in ('accepted','booked','appointment_missed')
       and new.status is distinct from old.status then
      raise exception 'Use the linked specialist appointment for referral progression';
    elsif new.status is distinct from old.status
       and old.status not in ('patient_approved','accepted','booked','appointment_missed') then
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

  if r.status not in ('accepted','appointment_missed') then
    raise exception 'Referral is not ready for booking';
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

create or replace function public.sync_referral_from_appointment()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.status='completed' and old.status is distinct from new.status then
    perform set_config('medibridge.referral_completion_update','allowed',true);

    update public.referrals
    set status='completed',
        updated_at=now()
    where booked_appointment_id=new.id
      and status='booked';

  elsif new.status='no_show' and old.status is distinct from new.status then
    perform set_config('medibridge.referral_missed_update','allowed',true);

    update public.referrals
    set status='appointment_missed',
        updated_at=now()
    where booked_appointment_id=new.id
      and status='booked';
  end if;

  return new;
end;
$$;

drop trigger if exists complete_linked_referral_trigger on public.appointments;
drop trigger if exists sync_referral_from_appointment_trigger on public.appointments;

create trigger sync_referral_from_appointment_trigger
after update of status on public.appointments
for each row
execute function public.sync_referral_from_appointment();

create or replace function public.sync_referral_appointment(
  target_referral uuid
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
    and (
      patient_id=auth.uid()
      or to_doctor_id=auth.uid()
      or public.is_admin()
    )
  for update;

  if not found then
    raise exception 'Referral not found';
  end if;

  if r.status not in ('accepted','booked','appointment_missed') then
    raise exception 'This referral does not need appointment sync';
  end if;

  if r.booked_appointment_id is not null then
    select * into a
    from public.appointments
    where id=r.booked_appointment_id
      and patient_id=r.patient_id
      and doctor_id=r.to_doctor_id;
  else
    select ap.* into a
    from public.appointments ap
    where ap.patient_id=r.patient_id
      and ap.doctor_id=r.to_doctor_id
      and ap.status in ('booked','confirmed','completed','no_show')
      and ap.appointment_start >= (r.created_at - interval '1 day')
      and not exists (
        select 1 from public.referrals other_r
        where other_r.booked_appointment_id=ap.id
          and other_r.id<>r.id
      )
    order by ap.appointment_start desc
    limit 1;
  end if;

  if a.id is null then
    raise exception 'No matching specialist appointment found for this referral';
  end if;

  if r.booked_appointment_id is null then
    perform set_config('medibridge.referral_booking_update','allowed',true);

    update public.referrals
    set booked_appointment_id=a.id,
        booked_at=now(),
        status='booked',
        updated_at=now()
    where id=r.id
    returning * into r;
  end if;

  if a.status='completed' then
    perform set_config('medibridge.referral_completion_update','allowed',true);
    update public.referrals
    set status='completed',updated_at=now()
    where id=r.id and status='booked'
    returning * into r;

  elsif a.status='no_show' then
    perform set_config('medibridge.referral_missed_update','allowed',true);
    update public.referrals
    set status='appointment_missed',updated_at=now()
    where id=r.id and status='booked'
    returning * into r;
  end if;

  return r;
end;
$$;

grant execute on function public.sync_referral_appointment(uuid)
to authenticated;


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
    and r.status in ('accepted','booked','appointment_missed');
$$;

revoke all on function public.get_referral_booking_doctor(uuid) from public;
grant execute on function public.get_referral_booking_doctor(uuid) to authenticated;




-- ===== v23.5 additions =====

-- MediBridge v23.5 — Doctor can close a no-show referral
-- Run after v23-4-backend.sql.
--
-- After a linked specialist appointment is marked no_show:
-- - referral moves to appointment_missed
-- - patient may rebook
-- - receiving doctor may explicitly end/close the referral if further rebooking is not appropriate
--
-- We use a distinct terminal status: closed_no_show

alter table public.referrals
  drop constraint if exists referrals_status_check;

alter table public.referrals
  add constraint referrals_status_check
  check (status in (
    'proposed','patient_approved','accepted','booked',
    'appointment_missed','declined','completed','cancelled','closed_no_show'
  ));

create or replace function public.protect_referral_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_override boolean :=
    current_setting('medibridge.referral_booking_update',true) = 'allowed';
  completion_override boolean :=
    current_setting('medibridge.referral_completion_update',true) = 'allowed';
  missed_override boolean :=
    current_setting('medibridge.referral_missed_update',true) = 'allowed';
  doctor_close_override boolean :=
    current_setting('medibridge.referral_doctor_close_update',true) = 'allowed';
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

  if (new.booked_appointment_id is distinct from old.booked_appointment_id
      or new.booked_at is distinct from old.booked_at)
     and not booking_override
     and not missed_override then
    raise exception 'Referral appointment linkage must use the secure pathway';
  end if;

  if booking_override then
    if old.status not in ('accepted','appointment_missed')
       or new.status <> 'booked'
       or new.booked_appointment_id is null then
      raise exception 'Invalid internal referral booking transition';
    end if;
    new.updated_at := now();
    return new;
  end if;

  if completion_override then
    if old.status <> 'booked' or new.status <> 'completed' then
      raise exception 'Invalid internal referral completion transition';
    end if;
    new.updated_at := now();
    return new;
  end if;

  if missed_override then
    if old.status <> 'booked' or new.status <> 'appointment_missed' then
      raise exception 'Invalid internal referral no-show transition';
    end if;
    new.updated_at := now();
    return new;
  end if;

  if doctor_close_override then
    if old.status <> 'appointment_missed' or new.status <> 'closed_no_show' then
      raise exception 'Invalid no-show referral close transition';
    end if;
    new.updated_at := now();
    return new;
  end if;

  if new.status='completed' and old.status is distinct from new.status then
    raise exception 'Complete the linked specialist appointment. The referral will close automatically.';
  end if;

  if auth.uid() = old.patient_id then
    if old.status = 'proposed'
       and new.status not in ('patient_approved','cancelled') then
      raise exception 'Patient may approve or cancel this referral';
    elsif old.status in ('patient_approved','accepted','booked','appointment_missed')
       and new.status is distinct from old.status
       and new.status <> 'cancelled' then
      raise exception 'Use the referral booking pathway to change appointment state';
    elsif old.status not in ('proposed','patient_approved','accepted','booked','appointment_missed')
       and new.status is distinct from old.status then
      raise exception 'Invalid patient referral status change';
    end if;

  elsif auth.uid() = old.to_doctor_id then
    if old.status = 'patient_approved'
       and new.status not in ('accepted','declined') then
      raise exception 'Receiving doctor may accept or decline';
    elsif old.status in ('accepted','booked')
       and new.status is distinct from old.status then
      raise exception 'Use the linked specialist appointment for referral progression';
    elsif old.status='appointment_missed'
       and new.status is distinct from old.status then
      raise exception 'Use the close-no-show action or wait for patient rebooking';
    elsif new.status is distinct from old.status
       and old.status not in ('patient_approved','accepted','booked','appointment_missed') then
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

create or replace function public.close_no_show_referral(
  target_referral uuid
)
returns public.referrals
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.referrals%rowtype;
begin
  select * into r
  from public.referrals
  where id=target_referral
    and to_doctor_id=auth.uid()
  for update;

  if not found then
    raise exception 'Referral not found';
  end if;

  if r.status <> 'appointment_missed' then
    raise exception 'Only a no-show referral can be closed from this action';
  end if;

  if not public.is_verified_doctor(auth.uid()) then
    raise exception 'Verified doctor required';
  end if;

  perform set_config('medibridge.referral_doctor_close_update','allowed',true);

  update public.referrals
  set status='closed_no_show',
      updated_at=now()
  where id=target_referral
  returning * into r;

  return r;
end;
$$;

grant execute on function public.close_no_show_referral(uuid)
to authenticated;
