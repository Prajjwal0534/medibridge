-- MediBridge v13: AI request audit metadata
-- Run once in Supabase SQL Editor before deploying v13.
-- Prompts and model answers are intentionally NOT stored in this table.

create table if not exists public.ai_request_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  user_role text not null check (user_role in ('patient','doctor','admin')),
  mode text not null check (
    mode in (
      'patient_explain',
      'patient_questions',
      'patient_summary',
      'doctor_reference',
      'doctor_patient_review'
    )
  ),
  patient_context_id uuid references public.patient_profiles(id) on delete set null,
  model_name text,
  created_at timestamptz not null default now()
);

alter table public.ai_request_log enable row level security;

drop policy if exists "Users can view own AI request metadata"
on public.ai_request_log;

create policy "Users can view own AI request metadata"
on public.ai_request_log
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin()
);

drop policy if exists "Users can insert own AI request metadata"
on public.ai_request_log;

create policy "Users can insert own AI request metadata"
on public.ai_request_log
for insert
to authenticated
with check (
  user_id = auth.uid()
);
