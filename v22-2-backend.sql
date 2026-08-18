-- MediBridge v22.2 — Diagnostic report publishing into patient Reports Hub
-- Run after v22.1.

-- Link a medical report back to its diagnostic request and source lab.
alter table public.medical_reports
  add column if not exists diagnostic_request_id uuid references public.diagnostic_requests(id) on delete set null,
  add column if not exists source_lab_id uuid references public.lab_profiles(id) on delete set null;

create unique index if not exists one_report_per_diagnostic_request
on public.medical_reports(diagnostic_request_id)
where diagnostic_request_id is not null;

create index if not exists medical_reports_source_lab_idx
on public.medical_reports(source_lab_id, created_at desc);

-- Replace the v18.2 validation trigger so verified diagnostic centres can publish
-- ONLY for a real diagnostic request assigned to them.
create or replace function public.validate_medical_report_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  -- Normal patient upload.
  if new.patient_id = auth.uid() and new.uploaded_by = auth.uid() then
    if new.appointment_id is not null and not exists (
      select 1 from public.appointments a
      where a.id = new.appointment_id
        and a.patient_id = new.patient_id
    ) then
      raise exception 'Appointment does not belong to this patient';
    end if;
    return new;
  end if;

  -- Verified lab publishing a report for its own diagnostic request.
  if new.source_lab_id = auth.uid()
     and new.uploaded_by = auth.uid()
     and new.diagnostic_request_id is not null
     and exists (
       select 1
       from public.diagnostic_requests r
       join public.profiles p on p.id = r.lab_id
       where r.id = new.diagnostic_request_id
         and r.lab_id = auth.uid()
         and r.patient_id = new.patient_id
         and p.role = 'lab'
         and p.verification_status = 'verified'
         and r.status in ('in_process','report_ready','completed')
     ) then
    return new;
  end if;

  raise exception 'Not authorized to create or change this medical report';
end;
$$;

-- Let a verified source lab read the report metadata it published.
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
        or r.source_lab_id = auth.uid()
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
            and (c.expires_at is null or c.expires_at > now())
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

-- Storage upload rule for diagnostic centres.
-- Path format: patient_id/lab_id/request_id/timestamp_filename

drop policy if exists "Verified labs upload diagnostic reports"
on storage.objects;

create policy "Verified labs upload diagnostic reports"
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'Medical reports'
  and (storage.foldername(name))[2] = auth.uid()::text
  and exists (
    select 1
    from public.diagnostic_requests r
    join public.profiles p on p.id = r.lab_id
    where r.id::text = (storage.foldername(name))[3]
      and r.patient_id::text = (storage.foldername(name))[1]
      and r.lab_id = auth.uid()
      and p.role='lab'
      and p.verification_status='verified'
      and r.status in ('in_process','report_ready')
  )
);

-- Register the already-uploaded private file and move the request to Report Ready.
create or replace function public.publish_diagnostic_report(
  target_request uuid,
  target_file_path text,
  target_file_name text,
  target_mime_type text default null,
  target_file_size bigint default null,
  report_note text default null
)
returns public.medical_reports
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  req public.diagnostic_requests%rowtype;
  report_row public.medical_reports%rowtype;
  generated_title text;
  generated_type text;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id=auth.uid()
      and p.role='lab'
      and p.verification_status='verified'
  ) then
    raise exception 'Verified diagnostic centre required';
  end if;

  select * into req
  from public.diagnostic_requests
  where id=target_request
    and lab_id=auth.uid()
  for update;

  if not found then
    raise exception 'Diagnostic request not found';
  end if;

  if req.status not in ('in_process','report_ready') then
    raise exception 'Report can be published only after processing has started';
  end if;

  if exists (
    select 1 from public.medical_reports m
    where m.diagnostic_request_id=target_request
  ) then
    raise exception 'A report is already published for this diagnostic request';
  end if;

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id='Medical reports'
      and o.name=target_file_path
  ) then
    raise exception 'Uploaded report file was not found';
  end if;

  select
    'Diagnostic report — ' || string_agg(i.test_name, ', ' order by i.test_name),
    case when count(distinct i.category)=1 then min(i.category) else 'other' end
  into generated_title, generated_type
  from public.diagnostic_request_items i
  where i.request_id=target_request;

  generated_title := coalesce(generated_title,'Diagnostic report');
  generated_type := case
    when generated_type in ('laboratory','imaging','pathology','cardiology','other') then generated_type
    else 'other'
  end;

  insert into public.medical_reports(
    patient_id,
    appointment_id,
    uploaded_by,
    title,
    report_type,
    report_date,
    notes,
    file_name,
    file_path,
    mime_type,
    file_size,
    diagnostic_request_id,
    source_lab_id
  )
  values(
    req.patient_id,
    null,
    auth.uid(),
    generated_title,
    generated_type,
    current_date,
    nullif(trim(report_note),''),
    target_file_name,
    target_file_path,
    target_mime_type,
    target_file_size,
    target_request,
    auth.uid()
  )
  returning * into report_row;

  update public.diagnostic_requests
  set status='report_ready',
      report_ready_at=coalesce(report_ready_at,now()),
      lab_note=coalesce(nullif(trim(report_note),''),lab_note),
      updated_at=now()
  where id=target_request;

  return report_row;
end;
$$;

grant execute on function public.publish_diagnostic_report(uuid,text,text,text,bigint,text)
to authenticated;
