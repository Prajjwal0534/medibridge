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
