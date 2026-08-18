-- MediBridge v23.3 — Referral booking-link + completion sync fix
-- Run after v23-2-backend.sql.
--
-- Bug fixed:
-- link_referral_appointment() correctly set the booking override flag,
-- but protect_referral_update() still rejected Accepted -> Booked for the patient.
-- Result: the appointment was created, while the referral stayed "Ready to book".
--
-- v23.3 fixes future bookings and adds a safe sync RPC for already-created appointments.

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
     and not booking_override then
    raise exception 'Referral booking must be linked through the booking pathway';
  end if;

  -- Internal secure booking transition.
  if booking_override then
    if old.status <> 'accepted'
       or new.status <> 'booked'
       or new.booked_appointment_id is null then
      raise exception 'Invalid internal referral booking transition';
    end if;

    new.updated_at := now();
    return new;
  end if;

  -- Internal secure completion transition from the linked appointment trigger.
  if completion_override then
    if old.status <> 'booked' or new.status <> 'completed' then
      raise exception 'Invalid internal referral completion transition';
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

-- Recreate/keep the normal booking linker using the fixed override behavior.
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

-- Safe recovery/synchronisation for an appointment that was created while
-- v23.2 left the referral at Accepted.
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

  if r.status not in ('accepted','booked') then
    raise exception 'This referral does not need appointment sync';
  end if;

  -- If already linked, simply synchronize with current appointment status.
  if r.booked_appointment_id is not null then
    select * into a
    from public.appointments
    where id=r.booked_appointment_id
      and patient_id=r.patient_id
      and doctor_id=r.to_doctor_id;
  else
    -- Recovery path: pick the latest matching active/completed specialist appointment.
    select ap.* into a
    from public.appointments ap
    where ap.patient_id=r.patient_id
      and ap.doctor_id=r.to_doctor_id
      and ap.status in ('booked','confirmed','completed')
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
    set status='completed',
        updated_at=now()
    where id=r.id
      and status='booked'
    returning * into r;
  end if;

  return r;
end;
$$;

grant execute on function public.sync_referral_appointment(uuid)
to authenticated;

-- Ensure future appointment completions close the linked referral.
create or replace function public.complete_linked_referral()
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
  end if;

  return new;
end;
$$;

drop trigger if exists complete_linked_referral_trigger on public.appointments;
create trigger complete_linked_referral_trigger
after update of status on public.appointments
for each row
execute function public.complete_linked_referral();
