-- MediBridge v18 — Reports & Investigations Hub
-- Run once in Supabase SQL Editor.

create table if not exists public.medical_reports (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  report_type text not null check (
    report_type in ('laboratory','imaging','pathology','cardiology','other')
  ),
  report_date date,
  notes text,
  file_name text not null,
  file_path text not null unique,
  mime_type text,
  file_size bigint,
  created_at timestamptz not null default now()
);

alter table public.medical_reports enable row level security;

create or replace function public.can_access_medical_report(target_report uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.medical_reports r
    where r.id = target_report
      and (
        r.patient_id = auth.uid()
        or public.is_admin()
        or exists (
          select 1
          from public.appointments a
          where a.id = r.appointment_id
            and a.doctor_id = auth.uid()
        )
        or exists (
          select 1
          from public.record_consents c
          where c.patient_id = r.patient_id
            and c.doctor_id = auth.uid()
            and c.status = 'active'
            and (
              c.expires_at is null
              or c.expires_at > now()
            )
            and (
              'reports' = any(c.scopes)
              or 'consultations' = any(c.scopes)
              or 'health_profile' = any(c.scopes)
            )
        )
      )
  );
$$;

revoke all on function public.can_access_medical_report(uuid) from public;
grant execute on function public.can_access_medical_report(uuid) to authenticated;

drop policy if exists "Patients can view own medical reports"
on public.medical_reports;

create policy "Patients can view own medical reports"
on public.medical_reports
for select to authenticated
using (patient_id = auth.uid());

drop policy if exists "Patients can upload own medical reports"
on public.medical_reports;

create policy "Patients can upload own medical reports"
on public.medical_reports
for insert to authenticated
with check (
  patient_id = auth.uid()
  and uploaded_by = auth.uid()
);

drop policy if exists "Report participants and consented doctors can view"
on public.medical_reports;

create policy "Report participants and consented doctors can view"
on public.medical_reports
for select to authenticated
using (public.can_access_medical_report(id));

drop policy if exists "Report uploader can delete"
on public.medical_reports;

create policy "Report uploader can delete"
on public.medical_reports
for delete to authenticated
using (
  uploaded_by = auth.uid()
  or public.is_admin()
);

insert into storage.buckets (id, name, public, file_size_limit)
values (
  'Medical reports',
  'Medical reports',
  false,
  15728640
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "Patients upload own medical reports"
on storage.objects;

create policy "Patients upload own medical reports"
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'Medical reports'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Medical report viewers can read files"
on storage.objects;

create policy "Medical report viewers can read files"
on storage.objects
for select to authenticated
using (
  bucket_id = 'Medical reports'
  and exists (
    select 1
    from public.medical_reports r
    where r.file_path = name
      and public.can_access_medical_report(r.id)
  )
);

drop policy if exists "Medical report uploader can delete files"
on storage.objects;

create policy "Medical report uploader can delete files"
on storage.objects
for delete to authenticated
using (
  bucket_id = 'Medical reports'
  and exists (
    select 1
    from public.medical_reports r
    where r.file_path = name
      and (
        r.uploaded_by = auth.uid()
        or public.is_admin()
      )
  )
);

create index if not exists medical_reports_patient_idx
on public.medical_reports(patient_id, report_date desc, created_at desc);

create index if not exists medical_reports_appointment_idx
on public.medical_reports(appointment_id);
