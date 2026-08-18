-- MediBridge v16 — Consultation Follow-up Assistant

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
    'doctor_patient_review'
  )
);

create table if not exists public.patient_consultation_ai_messages (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  message_role text not null check (message_role in ('user','assistant')),
  message_text text not null,
  created_at timestamptz not null default now()
);

alter table public.patient_consultation_ai_messages enable row level security;

drop policy if exists "Patients can view own consultation AI messages"
on public.patient_consultation_ai_messages;

create policy "Patients can view own consultation AI messages"
on public.patient_consultation_ai_messages
for select to authenticated
using (patient_id = auth.uid());

drop policy if exists "Patients can insert own consultation AI messages"
on public.patient_consultation_ai_messages;

create policy "Patients can insert own consultation AI messages"
on public.patient_consultation_ai_messages
for insert to authenticated
with check (patient_id = auth.uid());

create index if not exists patient_consultation_ai_messages_lookup_idx
on public.patient_consultation_ai_messages(patient_id, appointment_id, created_at);
