-- MediBridge v18.2 — Reports linked to appointments
-- Run once in Supabase SQL Editor.

create or replace function public.validate_medical_report_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() and new.patient_id <> auth.uid() then
    raise exception 'Patient mismatch';
  end if;

  if new.appointment_id is not null then
    if not exists (
      select 1
      from public.appointments a
      where a.id = new.appointment_id
        and a.patient_id = new.patient_id
    ) then
      raise exception 'Appointment does not belong to this patient';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_medical_report_link_trigger
on public.medical_reports;

create trigger validate_medical_report_link_trigger
before insert or update of patient_id, appointment_id
on public.medical_reports
for each row
execute function public.validate_medical_report_link();

drop policy if exists "Patients can update own medical reports"
on public.medical_reports;

create policy "Patients can update own medical reports"
on public.medical_reports
for update to authenticated
using (
  patient_id = auth.uid()
  and uploaded_by = auth.uid()
)
with check (
  patient_id = auth.uid()
  and uploaded_by = auth.uid()
);
