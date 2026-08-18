-- MediBridge v15: patient consultation AI explanation
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
    'doctor_reference',
    'doctor_patient_review'
  )
);
