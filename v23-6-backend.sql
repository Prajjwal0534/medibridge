-- MediBridge v23.6 — Urgent referral auto-scheduling
-- Run after the v23.5 COMPLETE backend.
--
-- UX rule:
-- Urgent referral does NOT require the patient to manually choose an appointment slot.
-- When the receiving verified specialist accepts it, MediBridge automatically creates
-- and links the earliest non-overlapping 20-minute appointment within the next 2 hours.
--
-- IMPORTANT:
-- An appointment record is still created internally for clinical audit, consultation,
-- prescription, reports and completion tracking.
--
-- Prototype choice: urgent auto-scheduled consultation_type = 'online'.
-- If no free 20-minute gap exists in the next 2 hours, the referral remains Accepted
-- and the doctor/patient are told that urgent manual coordination is required.

create or replace function public.accept_urgent_referral(
  target_referral uuid
)
returns public.referrals
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.referrals%rowtype;
  candidate_start timestamptz;
  candidate_end timestamptz;
  deadline timestamptz;
  appt_id uuid;
begin
  select * into r
  from public.referrals
  where id=target_referral
    and to_doctor_id=auth.uid()
  for update;

  if not found then
    raise exception 'Referral not found';
  end if;

  if r.status <> 'patient_approved' then
    raise exception 'Referral is not waiting for specialist acceptance';
  end if;

  if r.urgency <> 'urgent' then
    raise exception 'This function is only for urgent referrals';
  end if;

  if not public.is_verified_doctor(auth.uid()) then
    raise exception 'Verified doctor required';
  end if;

  -- First accept the referral normally.
  update public.referrals
  set status='accepted',
      updated_at=now()
  where id=r.id
  returning * into r;

  -- Start about 10 minutes from now, rounded to the next 5-minute boundary.
  candidate_start :=
    date_trunc('minute', now() + interval '10 minutes')
    + make_interval(mins =>
        (5 - (extract(minute from (now() + interval '10 minutes'))::int % 5)) % 5
      );

  deadline := now() + interval '2 hours';

  while candidate_start + interval '20 minutes' <= deadline loop
    candidate_end := candidate_start + interval '20 minutes';

    if not exists (
      select 1
      from public.appointments a
      where a.doctor_id=r.to_doctor_id
        and a.status in ('booked','confirmed')
        and candidate_start < a.appointment_end
        and candidate_end > a.appointment_start
    ) then
      begin
        insert into public.appointments(
          patient_id,
          doctor_id,
          appointment_start,
          appointment_end,
          consultation_type,
          reason_for_visit,
          status
        )
        values(
          r.patient_id,
          r.to_doctor_id,
          candidate_start,
          candidate_end,
          'online',
          'URGENT REFERRAL: ' || coalesce(r.reason,'Specialist review'),
          'confirmed'
        )
        returning id into appt_id;

        perform set_config('medibridge.referral_booking_update','allowed',true);

        update public.referrals
        set booked_appointment_id=appt_id,
            booked_at=now(),
            status='booked',
            updated_at=now()
        where id=r.id
        returning * into r;

        return r;

      exception
        when exclusion_violation or unique_violation then
          -- Another booking won the same slot. Try the next 5-minute gap.
          null;
      end;
    end if;

    candidate_start := candidate_start + interval '5 minutes';
  end loop;

  -- No free gap found. Keep it Accepted; patient does not need normal booking,
  -- but the receiving doctor must arrange the urgent consultation manually.
  return r;
end;
$$;

grant execute on function public.accept_urgent_referral(uuid)
to authenticated;
