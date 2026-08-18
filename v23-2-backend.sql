-- MediBridge v23.2 — Referral consultation & prescribing flow
-- Run after v23-backend.sql.
--
-- Rule:
-- A referral itself is NOT a prescription encounter.
-- The receiving specialist prescribes through the linked specialist appointment,
-- using the normal MediBridge consultation/prescription workflow.

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

  if (new.booked_appointment_id is distinct from old.booked_appointment_id
      or new.booked_at is distinct from old.booked_at)
     and current_setting('medibridge.referral_booking_update',true) is distinct from 'allowed' then
    raise exception 'Referral booking must be linked through the booking pathway';
  end if;

  -- Automatic completion is allowed only from the linked appointment trigger.
  if new.status='completed'
     and old.status is distinct from new.status
     and current_setting('medibridge.referral_completion_update',true) is distinct from 'allowed' then
    raise exception 'Complete the linked specialist appointment. The referral will close automatically.';
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
       and new.status is distinct from old.status then
      raise exception 'The receiving doctor must use the linked appointment for consultation and prescribing';
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

create or replace function public.complete_linked_referral()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.status='completed' and old.status is distinct from new.status then
    perform set_config('medibridge.referral_booking_update','allowed',true);
    perform set_config('medibridge.referral_completion_update','allowed',true);

    update public.referrals
    set status='completed',updated_at=now()
    where booked_appointment_id=new.id
      and status='booked';
  end if;

  return new;
end;
$$;

-- Recovery only for v23/v23.1 test referrals that were manually completed
-- before a specialist appointment was booked.
create or replace function public.reopen_unbooked_completed_referral(
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
    and status='completed'
    and booked_appointment_id is null
    and (patient_id=auth.uid() or to_doctor_id=auth.uid())
  for update;

  if not found then
    raise exception 'This referral cannot be reopened';
  end if;

  perform set_config('medibridge.referral_completion_update','allowed',true);

  update public.referrals
  set status='accepted',updated_at=now()
  where id=target_referral
  returning * into r;

  return r;
end;
$$;

grant execute on function public.reopen_unbooked_completed_referral(uuid)
to authenticated;
