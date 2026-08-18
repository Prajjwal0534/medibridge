-- MediBridge v19 — Follow-up & Reminder System

create table if not exists public.followup_reminders (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patient_profiles(id) on delete cascade,
  consultation_id uuid not null references public.consultations(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  follow_up_date date not null,
  status text not null default 'pending'
    check (status in ('pending','booked','completed','dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (consultation_id)
);

alter table public.followup_reminders enable row level security;

drop policy if exists "Patients can view own followup reminders"
on public.followup_reminders;
create policy "Patients can view own followup reminders"
on public.followup_reminders for select to authenticated
using (patient_id = auth.uid());

drop policy if exists "Patients can update own followup reminders"
on public.followup_reminders;
create policy "Patients can update own followup reminders"
on public.followup_reminders for update to authenticated
using (patient_id = auth.uid())
with check (patient_id = auth.uid());

drop policy if exists "Assigned doctors can view followup reminders"
on public.followup_reminders;
create policy "Assigned doctors can view followup reminders"
on public.followup_reminders for select to authenticated
using (
  exists (
    select 1 from public.appointments a
    where a.id = appointment_id
      and a.doctor_id = auth.uid()
  )
);

create or replace function public.sync_followup_reminder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.follow_up_date is null then
    delete from public.followup_reminders
    where consultation_id = new.id;
    return new;
  end if;

  insert into public.followup_reminders (
    patient_id, consultation_id, appointment_id,
    follow_up_date, status, updated_at
  )
  values (
    new.patient_id, new.id, new.appointment_id,
    new.follow_up_date, 'pending', now()
  )
  on conflict (consultation_id)
  do update set
    patient_id = excluded.patient_id,
    appointment_id = excluded.appointment_id,
    follow_up_date = excluded.follow_up_date,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists sync_followup_reminder_trigger
on public.consultations;

create trigger sync_followup_reminder_trigger
after insert or update of follow_up_date
on public.consultations
for each row execute function public.sync_followup_reminder();

insert into public.followup_reminders (
  patient_id, consultation_id, appointment_id, follow_up_date, status
)
select
  c.patient_id, c.id, c.appointment_id, c.follow_up_date, 'pending'
from public.consultations c
where c.follow_up_date is not null
on conflict (consultation_id) do nothing;

create index if not exists followup_reminders_patient_date_idx
on public.followup_reminders(patient_id, follow_up_date, status);
