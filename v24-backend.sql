-- MediBridge v24 — Persistent in-app notifications
-- Run after the current v23.x backend migrations.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_type text not null,
  title text not null,
  message text not null,
  entity_type text,
  entity_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications"
on public.notifications for select to authenticated
using (user_id=auth.uid() or public.is_admin());

drop policy if exists "Users update own notifications" on public.notifications;
create policy "Users update own notifications"
on public.notifications for update to authenticated
using (user_id=auth.uid())
with check (user_id=auth.uid());

drop policy if exists "Users delete own notifications" on public.notifications;
create policy "Users delete own notifications"
on public.notifications for delete to authenticated
using (user_id=auth.uid());

create index if not exists notifications_user_created_idx
on public.notifications(user_id,created_at desc);

create index if not exists notifications_user_unread_idx
on public.notifications(user_id,is_read,created_at desc);

create or replace function public.push_notification(
  target_user uuid,
  target_type text,
  target_title text,
  target_message text,
  target_entity_type text default null,
  target_entity_id uuid default null
)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if target_user is null then
    return;
  end if;

  insert into public.notifications(
    user_id,notification_type,title,message,entity_type,entity_id
  )
  values(
    target_user,target_type,target_title,target_message,target_entity_type,target_entity_id
  );
end;
$$;

revoke all on function public.push_notification(uuid,text,text,text,text,uuid) from public;

-- APPOINTMENTS -------------------------------------------------------------

create or replace function public.notify_appointment_insert()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.push_notification(
    new.patient_id,
    'appointment_booked',
    'Appointment booked',
    'Your appointment has been added to MediBridge.',
    'appointment',
    new.id
  );

  perform public.push_notification(
    new.doctor_id,
    'new_appointment',
    'New appointment',
    'A patient has been added to your schedule.',
    'appointment',
    new.id
  );

  return new;
end;
$$;

drop trigger if exists notify_appointment_insert_trigger on public.appointments;
create trigger notify_appointment_insert_trigger
after insert on public.appointments
for each row
execute function public.notify_appointment_insert();

create or replace function public.notify_appointment_status()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if new.status='confirmed' then
    perform public.push_notification(
      new.patient_id,'appointment_confirmed','Appointment confirmed',
      'Your doctor confirmed the appointment.','appointment',new.id
    );

  elsif new.status='completed' then
    perform public.push_notification(
      new.patient_id,'appointment_completed','Consultation completed',
      'Your consultation has been completed. Your clinical record is available in MediBridge.',
      'appointment',new.id
    );

  elsif new.status='no_show' then
    perform public.push_notification(
      new.patient_id,'appointment_no_show','Appointment marked no-show',
      'This appointment was marked as not attended.','appointment',new.id
    );

  elsif new.status='cancelled' then
    perform public.push_notification(
      new.patient_id,'appointment_cancelled','Appointment cancelled',
      'An appointment in your care schedule was cancelled.','appointment',new.id
    );

    perform public.push_notification(
      new.doctor_id,'appointment_cancelled','Appointment cancelled',
      'An appointment in your schedule was cancelled.','appointment',new.id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists notify_appointment_status_trigger on public.appointments;
create trigger notify_appointment_status_trigger
after update of status on public.appointments
for each row
execute function public.notify_appointment_status();

-- REFERRALS ----------------------------------------------------------------

create or replace function public.notify_referral_insert()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.push_notification(
    new.patient_id,'referral_created','New specialist referral',
    'A doctor created a specialist referral for you. Review it and choose which records to share.',
    'referral',new.id
  );

  return new;
end;
$$;

drop trigger if exists notify_referral_insert_trigger on public.referrals;
create trigger notify_referral_insert_trigger
after insert on public.referrals
for each row
execute function public.notify_referral_insert();

create or replace function public.notify_referral_status()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if new.status='patient_approved' then
    perform public.push_notification(
      new.to_doctor_id,'referral_approved','Referral ready for review',
      'A patient approved a referral and shared selected records with you.',
      'referral',new.id
    );

  elsif new.status='accepted' then
    perform public.push_notification(
      new.patient_id,'referral_accepted','Specialist accepted referral',
      case
        when new.urgency='urgent'
          then 'The specialist accepted your urgent referral. MediBridge is prioritizing the earliest possible consultation.'
        else 'The specialist accepted your referral. You can now continue the booking pathway.'
      end,
      'referral',new.id
    );

  elsif new.status='booked' then
    perform public.push_notification(
      new.patient_id,'referral_booked','Referral appointment scheduled',
      case
        when new.urgency='urgent'
          then 'Your urgent specialist consultation has been auto-scheduled.'
        else 'Your referred specialist appointment is booked.'
      end,
      'referral',new.id
    );

    perform public.push_notification(
      new.to_doctor_id,'referral_booked','Referral appointment scheduled',
      'The referred patient now has a linked specialist appointment in your schedule.',
      'referral',new.id
    );

  elsif new.status='appointment_missed' then
    perform public.push_notification(
      new.patient_id,'referral_no_show','Specialist appointment missed',
      'The referral remains active. You can rebook the specialist unless the referral is closed.',
      'referral',new.id
    );

    perform public.push_notification(
      new.to_doctor_id,'referral_no_show','Referral appointment no-show',
      'The patient did not attend. You may wait for rebooking or close the referral.',
      'referral',new.id
    );

  elsif new.status='completed' then
    perform public.push_notification(
      new.patient_id,'referral_completed','Referral care completed',
      'Your specialist referral pathway has been completed.',
      'referral',new.id
    );

    perform public.push_notification(
      new.from_doctor_id,'referral_completed','Referred care completed',
      'A specialist referral you created has completed its care pathway.',
      'referral',new.id
    );

  elsif new.status='closed_no_show' then
    perform public.push_notification(
      new.patient_id,'referral_closed','Referral closed after no-show',
      'The receiving specialist closed this referral after the missed appointment.',
      'referral',new.id
    );

  elsif new.status='declined' then
    perform public.push_notification(
      new.patient_id,'referral_declined','Referral declined',
      'The receiving specialist declined this referral. Please follow up with the referring doctor.',
      'referral',new.id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists notify_referral_status_trigger on public.referrals;
create trigger notify_referral_status_trigger
after update of status on public.referrals
for each row
execute function public.notify_referral_status();

-- DIAGNOSTICS --------------------------------------------------------------

create or replace function public.notify_diagnostic_insert()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.push_notification(
    new.lab_id,'diagnostic_request','New diagnostic request',
    'A patient sent a new diagnostic test request.',
    'diagnostic_request',new.id
  );
  return new;
end;
$$;

drop trigger if exists notify_diagnostic_insert_trigger on public.diagnostic_requests;
create trigger notify_diagnostic_insert_trigger
after insert on public.diagnostic_requests
for each row
execute function public.notify_diagnostic_insert();

create or replace function public.notify_diagnostic_status()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  notification_title text;
  notification_message text;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  notification_title :=
    case new.status
      when 'accepted' then 'Diagnostic request accepted'
      when 'sample_pending' then 'Sample / visit pending'
      when 'in_process' then 'Tests in process'
      when 'report_ready' then 'Diagnostic report ready'
      when 'completed' then 'Diagnostic request completed'
      when 'rejected' then 'Diagnostic request declined'
      when 'cancelled' then 'Diagnostic request cancelled'
      else 'Diagnostic request updated'
    end;

  notification_message :=
    case new.status
      when 'accepted' then 'The diagnostic centre accepted your request.'
      when 'sample_pending' then 'Your diagnostic request is waiting for the sample or centre visit.'
      when 'in_process' then 'The diagnostic centre is processing your tests.'
      when 'report_ready' then 'Your diagnostic report is ready in MediBridge.'
      when 'completed' then 'Your diagnostic request has been completed.'
      when 'rejected' then 'The diagnostic centre declined this request.'
      when 'cancelled' then 'This diagnostic request was cancelled.'
      else 'Your diagnostic request status changed.'
    end;

  perform public.push_notification(
    new.patient_id,'diagnostic_status',notification_title,notification_message,
    'diagnostic_request',new.id
  );

  return new;
end;
$$;

drop trigger if exists notify_diagnostic_status_trigger on public.diagnostic_requests;
create trigger notify_diagnostic_status_trigger
after update of status on public.diagnostic_requests
for each row
execute function public.notify_diagnostic_status();

-- PHARMACY -----------------------------------------------------------------

create or replace function public.notify_pharmacy_insert()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.push_notification(
    new.pharmacy_id,'pharmacy_request','New prescription request',
    'A patient sent a prescription fulfilment request.',
    'pharmacy_request',new.id
  );
  return new;
end;
$$;

drop trigger if exists notify_pharmacy_insert_trigger on public.pharmacy_requests;
create trigger notify_pharmacy_insert_trigger
after insert on public.pharmacy_requests
for each row
execute function public.notify_pharmacy_insert();

create or replace function public.notify_pharmacy_status()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  notification_title text;
  notification_message text;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  notification_title :=
    case new.status
      when 'accepted' then 'Pharmacy accepted request'
      when 'preparing' then 'Medicines being prepared'
      when 'ready' then 'Medicines ready'
      when 'fulfilled' then 'Pharmacy request completed'
      when 'rejected' then 'Pharmacy request declined'
      when 'cancelled' then 'Pharmacy request cancelled'
      else 'Pharmacy request updated'
    end;

  notification_message :=
    case new.status
      when 'accepted' then 'The pharmacy accepted your prescription request.'
      when 'preparing' then 'The pharmacy is preparing your medicines.'
      when 'ready' then 'Your medicines are ready for collection/fulfilment.'
      when 'fulfilled' then 'Your pharmacy request has been fulfilled.'
      when 'rejected' then 'The pharmacy declined this prescription request.'
      when 'cancelled' then 'This pharmacy request was cancelled.'
      else 'Your pharmacy request status changed.'
    end;

  perform public.push_notification(
    new.patient_id,'pharmacy_status',notification_title,notification_message,
    'pharmacy_request',new.id
  );

  return new;
end;
$$;

drop trigger if exists notify_pharmacy_status_trigger on public.pharmacy_requests;
create trigger notify_pharmacy_status_trigger
after update of status on public.pharmacy_requests
for each row
execute function public.notify_pharmacy_status();
