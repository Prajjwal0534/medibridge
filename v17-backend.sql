-- MediBridge v17 — Doctor AI pre-completion review
-- Run once in Supabase SQL Editor.

alter table public.ai_request_log
drop constraint if exists ai_request_log_mode_check;

alter table public.ai_request_log
add constraint ai_request_log_mode_check
check (
  mode in (
    'patient_explain',
    'patient_questions',
    'patient_summary',
    'patient_consultation_explain',
    'patient_consultation_question',
    'doctor_reference',
    'doctor_patient_review',
    'doctor_precompletion_review'
  )
);

create or replace function public.get_doctor_precompletion_patient_context(
  target_appointment uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  appt public.appointments%rowtype;
  result jsonb;
begin
  if not public.is_verified_doctor(auth.uid()) then
    raise exception 'Verified doctor required';
  end if;

  select *
  into appt
  from public.appointments
  where id = target_appointment
    and doctor_id = auth.uid()
    and status in ('booked','confirmed');

  if not found then
    raise exception 'Active assigned appointment not found';
  end if;

  select jsonb_build_object(
    'appointment', jsonb_build_object(
      'id', appt.id,
      'patient_id', appt.patient_id,
      'appointment_start', appt.appointment_start,
      'consultation_type', appt.consultation_type,
      'reason_for_visit', appt.reason_for_visit,
      'status', appt.status
    ),
    'allergies', coalesce((
      select jsonb_agg(to_jsonb(x))
      from public.patient_allergies x
      where x.patient_id = appt.patient_id
    ), '[]'::jsonb),
    'conditions', coalesce((
      select jsonb_agg(to_jsonb(x))
      from public.patient_conditions x
      where x.patient_id = appt.patient_id
    ), '[]'::jsonb),
    'current_medications', coalesce((
      select jsonb_agg(to_jsonb(x))
      from public.patient_medications x
      where x.patient_id = appt.patient_id
    ), '[]'::jsonb),
    'recent_vitals', coalesce((
      select jsonb_agg(to_jsonb(x))
      from (
        select *
        from public.patient_vitals
        where patient_id = appt.patient_id
        order by measured_at desc
        limit 10
      ) x
    ), '[]'::jsonb)
  )
  into result;

  return result;
end;
$$;

revoke all on function public.get_doctor_precompletion_patient_context(uuid)
from public;

grant execute on function public.get_doctor_precompletion_patient_context(uuid)
to authenticated;
