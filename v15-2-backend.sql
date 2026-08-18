-- MediBridge v15.2
-- Stable/cached patient consultation explanations.
-- Run once in Supabase SQL Editor.

create table if not exists public.patient_consultation_ai_explanations (
  appointment_id uuid primary key references public.appointments(id) on delete cascade,
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  consultation_id uuid references public.consultations(id) on delete cascade,
  record_fingerprint text not null,
  answer text not null,
  model_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.patient_consultation_ai_explanations enable row level security;

drop policy if exists "Patients can view own consultation AI explanations"
on public.patient_consultation_ai_explanations;

create policy "Patients can view own consultation AI explanations"
on public.patient_consultation_ai_explanations
for select
to authenticated
using (patient_id = auth.uid());

drop policy if exists "Patients can insert own consultation AI explanations"
on public.patient_consultation_ai_explanations;

create policy "Patients can insert own consultation AI explanations"
on public.patient_consultation_ai_explanations
for insert
to authenticated
with check (patient_id = auth.uid());

drop policy if exists "Patients can update own consultation AI explanations"
on public.patient_consultation_ai_explanations;

create policy "Patients can update own consultation AI explanations"
on public.patient_consultation_ai_explanations
for update
to authenticated
using (patient_id = auth.uid())
with check (patient_id = auth.uid());

create index if not exists patient_consultation_ai_explanations_patient_idx
on public.patient_consultation_ai_explanations(patient_id);
