-- MediBridge v23.7 — No-show referral sync fix
-- Run after v23.6.

create or replace function public.sync_referral_for_appointment(
  target_appointment uuid
)
returns public.referrals
language plpgsql
security definer
set search_path=public
as $$
declare
  a public.appointments%rowtype;
  r public.referrals%rowtype;
begin
  select * into a
  from public.appointments
  where id=target_appointment
    and (
      patient_id=auth.uid()
      or doctor_id=auth.uid()
      or public.is_admin()
    );

  if not found then
    raise exception 'Appointment not found or access denied';
  end if;

  select * into r
  from public.referrals
  where booked_appointment_id=a.id
  for update;

  if not found then
    raise exception 'No referral is linked to this appointment';
  end if;

  if a.status='no_show' and r.status='booked' then
    perform set_config('medibridge.referral_missed_update','allowed',true);

    update public.referrals
    set status='appointment_missed',
        updated_at=now()
    where id=r.id
    returning * into r;

  elsif a.status='completed' and r.status='booked' then
    perform set_config('medibridge.referral_completion_update','allowed',true);

    update public.referrals
    set status='completed',
        updated_at=now()
    where id=r.id
    returning * into r;
  end if;

  return r;
end;
$$;

grant execute on function public.sync_referral_for_appointment(uuid)
to authenticated;

create or replace function public.sync_referral_from_appointment()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.status='no_show' and old.status is distinct from new.status then
    perform set_config('medibridge.referral_missed_update','allowed',true);
    update public.referrals
    set status='appointment_missed', updated_at=now()
    where booked_appointment_id=new.id
      and status='booked';

  elsif new.status='completed' and old.status is distinct from new.status then
    perform set_config('medibridge.referral_completion_update','allowed',true);
    update public.referrals
    set status='completed', updated_at=now()
    where booked_appointment_id=new.id
      and status='booked';
  end if;

  return new;
end;
$$;

drop trigger if exists complete_linked_referral_trigger on public.appointments;
drop trigger if exists sync_referral_from_appointment_trigger on public.appointments;

create trigger sync_referral_from_appointment_trigger
after update of status on public.appointments
for each row
execute function public.sync_referral_from_appointment();
