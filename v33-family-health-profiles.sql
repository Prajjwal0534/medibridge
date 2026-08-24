-- MediBridge v33 — Family Health Profiles
-- One patient login can safely manage multiple healthcare subjects (Self, Mother, Father, etc.)
-- without creating additional auth accounts and without mixing medical records.
--
-- Architecture:
--   patient_id  = authenticated MediBridge account owner
--   subject_id  = the actual person receiving care
--
-- Run after v32 security hardening.

-- Apply v33 atomically. If any prerequisite or migration statement fails,
-- PostgreSQL rolls the whole migration back instead of leaving a half-migrated
-- healthcare identity model.
begin;

-- Fail before changing data when an earlier MediBridge migration is missing.
do $$
declare
  relation_name text;
  function_name text;
  missing_relations text[] := array[]::text[];
  missing_functions text[] := array[]::text[];
begin
  foreach relation_name in array array[
    'profiles','patient_profiles','appointments','hospital_appointments','consultations',
    'prescription_items','referrals','referral_shared_appointments','record_consents',
    'record_access_log','patient_allergies','patient_conditions','patient_medications',
    'patient_surgeries','patient_immunizations','patient_family_history','patient_vitals',
    'patient_consultation_ai_explanations','patient_consultation_ai_messages','medical_reports',
    'followup_reminders','pharmacy_requests','diagnostic_requests','diagnostic_request_items',
    'lab_tests','record_access_requests','care_plans','emergency_arrival_requests'
  ] loop
    if to_regclass('public.' || relation_name) is null then
      missing_relations := array_append(missing_relations, relation_name);
    end if;
  end loop;

  foreach function_name in array array[
    'public.is_admin()',
    'public.is_verified_doctor(uuid)',
    'public.can_access_appointment(uuid)',
    'public.can_access_consultation(uuid)',
    'public.can_view_shared_appointment(uuid)',
    'public.push_notification(uuid,text,text,text,text,uuid)'
  ] loop
    if to_regprocedure(function_name) is null then
      missing_functions := array_append(missing_functions, function_name);
    end if;
  end loop;

  if cardinality(missing_relations) > 0 or cardinality(missing_functions) > 0 then
    raise exception 'MediBridge v33 prerequisites missing. Tables: [%]. Functions: [%]',
      array_to_string(missing_relations, ', '),
      array_to_string(missing_functions, ', ');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Patient subjects
-- ---------------------------------------------------------------------------

create table if not exists public.patient_subjects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.patient_profiles(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 1 and 160),
  relationship text not null check (relationship in (
    'self','mother','father','sister','brother','spouse','daughter','son',
    'grandmother','grandfather','guardian','other'
  )),
  date_of_birth date,
  gender text check (gender is null or char_length(gender) <= 50),
  blood_group text check (blood_group is null or char_length(blood_group) <= 16),
  phone text check (phone is null or char_length(phone) <= 40),
  emergency_contact_name text check (emergency_contact_name is null or char_length(emergency_contact_name) <= 160),
  emergency_contact_phone text check (emergency_contact_phone is null or char_length(emergency_contact_phone) <= 40),
  is_self boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((is_self and relationship='self') or (not is_self and relationship<>'self'))
);

create unique index if not exists patient_subjects_one_self_per_owner_idx
on public.patient_subjects(owner_user_id)
where is_self;

create index if not exists patient_subjects_owner_active_idx
on public.patient_subjects(owner_user_id,is_active,created_at);

alter table public.patient_subjects enable row level security;

-- Backfill one Self subject for every existing patient account.
insert into public.patient_subjects (
  owner_user_id,full_name,relationship,date_of_birth,gender,blood_group,phone,
  emergency_contact_name,emergency_contact_phone,is_self,is_active
)
select
  p.id,
  coalesce(nullif(trim(p.full_name),''),'My profile'),
  'self',
  pp.date_of_birth,
  pp.gender,
  pp.blood_group,
  p.phone,
  pp.emergency_contact_name,
  pp.emergency_contact_phone,
  true,
  true
from public.profiles p
join public.patient_profiles pp on pp.id=p.id
where p.role='patient'
  and not exists (
    select 1 from public.patient_subjects s
    where s.owner_user_id=p.id and s.is_self
  );

create or replace function public.my_self_subject_id(target_owner uuid default auth.uid())
returns uuid
language sql
stable
security definer
set search_path=public
as $$
  select s.id
  from public.patient_subjects s
  where s.owner_user_id=target_owner
    and s.is_self=true
  limit 1;
$$;

create or replace function public.is_my_patient_subject(target_subject uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists (
    select 1 from public.patient_subjects s
    where s.id=target_subject
      and s.owner_user_id=auth.uid()
      and s.is_active=true
  );
$$;

create or replace function public.list_my_patient_subjects()
returns setof public.patient_subjects
language sql
stable
security definer
set search_path=public
as $$
  select s.*
  from public.patient_subjects s
  where s.owner_user_id=auth.uid()
    and s.is_active=true
  order by s.is_self desc,s.created_at asc;
$$;

revoke all on function public.list_my_patient_subjects() from public;
grant execute on function public.list_my_patient_subjects() to authenticated;

create or replace function public.ensure_my_self_subject()
returns public.patient_subjects
language plpgsql
security definer
set search_path=public
as $$
declare
  result public.patient_subjects%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='patient'
  ) then
    raise exception 'Patient account required';
  end if;

  select * into result
  from public.patient_subjects
  where owner_user_id=auth.uid() and is_self=true
  limit 1;

  if found then
    return result;
  end if;

  begin
    insert into public.patient_subjects (
      owner_user_id,full_name,relationship,date_of_birth,gender,blood_group,phone,
      emergency_contact_name,emergency_contact_phone,is_self,is_active
    )
    select
      p.id,
      coalesce(nullif(trim(p.full_name),''),'My profile'),
      'self',
      pp.date_of_birth,
      pp.gender,
      pp.blood_group,
      p.phone,
      pp.emergency_contact_name,
      pp.emergency_contact_phone,
      true,
      true
    from public.profiles p
    join public.patient_profiles pp on pp.id=p.id
    where p.id=auth.uid()
    returning * into result;
  exception
    when unique_violation then
      -- Two tabs may initialise Self at the same time. Reuse the winner safely.
      select * into result
      from public.patient_subjects
      where owner_user_id=auth.uid() and is_self=true
      limit 1;
  end;

  if result.id is null then
    raise exception 'Unable to initialise Self healthcare profile';
  end if;

  return result;
end;
$$;

revoke all on function public.ensure_my_self_subject() from public;
grant execute on function public.ensure_my_self_subject() to authenticated;
revoke all on function public.my_self_subject_id(uuid) from public,anon,authenticated;
revoke all on function public.is_my_patient_subject(uuid) from public;
grant execute on function public.is_my_patient_subject(uuid) to authenticated;

create or replace function public.create_my_family_subject(
  member_name text,
  member_relationship text,
  member_date_of_birth date default null,
  member_gender text default null,
  member_blood_group text default null,
  member_phone text default null,
  member_emergency_contact_name text default null,
  member_emergency_contact_phone text default null
)
returns public.patient_subjects
language plpgsql
security definer
set search_path=public
as $$
declare
  result public.patient_subjects%rowtype;
  normalized_relationship text := lower(trim(coalesce(member_relationship,'')));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id=auth.uid() and p.role='patient'
  ) then
    raise exception 'Patient account required';
  end if;

  if char_length(trim(coalesce(member_name,''))) < 1 then
    raise exception 'Family member name is required';
  end if;

  if char_length(trim(member_name)) > 160 then raise exception 'Family member name is too long'; end if;
  if char_length(coalesce(member_gender,'')) > 50 then raise exception 'Gender value is too long'; end if;
  if char_length(coalesce(member_blood_group,'')) > 16 then raise exception 'Blood group value is too long'; end if;
  if char_length(coalesce(member_phone,'')) > 40 then raise exception 'Phone number is too long'; end if;
  if char_length(coalesce(member_emergency_contact_name,'')) > 160 then raise exception 'Emergency contact name is too long'; end if;
  if char_length(coalesce(member_emergency_contact_phone,'')) > 40 then raise exception 'Emergency contact phone is too long'; end if;

  if normalized_relationship not in (
    'mother','father','sister','brother','spouse','daughter','son',
    'grandmother','grandfather','guardian','other'
  ) then
    raise exception 'Choose a valid relationship';
  end if;

  if member_date_of_birth is not null and member_date_of_birth > current_date then
    raise exception 'Date of birth cannot be in the future';
  end if;

  insert into public.patient_subjects (
    owner_user_id,full_name,relationship,date_of_birth,gender,blood_group,phone,
    emergency_contact_name,emergency_contact_phone,is_self,is_active
  ) values (
    auth.uid(),trim(member_name),normalized_relationship,member_date_of_birth,
    nullif(trim(coalesce(member_gender,'')),''),
    nullif(trim(coalesce(member_blood_group,'')),''),
    nullif(trim(coalesce(member_phone,'')),''),
    nullif(trim(coalesce(member_emergency_contact_name,'')),''),
    nullif(trim(coalesce(member_emergency_contact_phone,'')),''),
    false,true
  ) returning * into result;

  return result;
end;
$$;

revoke all on function public.create_my_family_subject(text,text,date,text,text,text,text,text) from public;
grant execute on function public.create_my_family_subject(text,text,date,text,text,text,text,text)
to authenticated;

create or replace function public.update_my_patient_subject(
  target_subject uuid,
  member_name text,
  member_date_of_birth date default null,
  member_gender text default null,
  member_blood_group text default null,
  member_phone text default null,
  member_emergency_contact_name text default null,
  member_emergency_contact_phone text default null
)
returns public.patient_subjects
language plpgsql
security definer
set search_path=public
as $$
declare
  current_row public.patient_subjects%rowtype;
  result public.patient_subjects%rowtype;
begin
  select * into current_row
  from public.patient_subjects
  where id=target_subject and owner_user_id=auth.uid() and is_active=true
  for update;

  if not found then
    raise exception 'Patient profile not found';
  end if;

  if member_date_of_birth is not null and member_date_of_birth > current_date then
    raise exception 'Date of birth cannot be in the future';
  end if;

  if char_length(coalesce(member_name,'')) > 160 then raise exception 'Family member name is too long'; end if;
  if char_length(coalesce(member_gender,'')) > 50 then raise exception 'Gender value is too long'; end if;
  if char_length(coalesce(member_blood_group,'')) > 16 then raise exception 'Blood group value is too long'; end if;
  if char_length(coalesce(member_phone,'')) > 40 then raise exception 'Phone number is too long'; end if;
  if char_length(coalesce(member_emergency_contact_name,'')) > 160 then raise exception 'Emergency contact name is too long'; end if;
  if char_length(coalesce(member_emergency_contact_phone,'')) > 40 then raise exception 'Emergency contact phone is too long'; end if;

  update public.patient_subjects
  set
    full_name = case
      when current_row.is_self then current_row.full_name
      else coalesce(nullif(trim(coalesce(member_name,'')),''),current_row.full_name)
    end,
    date_of_birth=member_date_of_birth,
    gender=nullif(trim(coalesce(member_gender,'')),''),
    blood_group=nullif(trim(coalesce(member_blood_group,'')),''),
    phone=case
      when current_row.is_self then current_row.phone
      else nullif(trim(coalesce(member_phone,'')),'')
    end,
    emergency_contact_name=nullif(trim(coalesce(member_emergency_contact_name,'')),''),
    emergency_contact_phone=nullif(trim(coalesce(member_emergency_contact_phone,'')),''),
    updated_at=now()
  where id=target_subject
  returning * into result;

  -- Keep the original patient profile compatible for the account holder's Self subject.
  if current_row.is_self then
    update public.patient_profiles
    set
      date_of_birth=member_date_of_birth,
      gender=nullif(trim(coalesce(member_gender,'')),''),
      blood_group=nullif(trim(coalesce(member_blood_group,'')),''),
      emergency_contact_name=nullif(trim(coalesce(member_emergency_contact_name,'')),''),
      emergency_contact_phone=nullif(trim(coalesce(member_emergency_contact_phone,'')),'')
    where id=auth.uid();
  end if;

  return result;
end;
$$;

revoke all on function public.update_my_patient_subject(uuid,text,date,text,text,text,text,text) from public;
grant execute on function public.update_my_patient_subject(uuid,text,date,text,text,text,text,text)
to authenticated;

-- Keep Self display name/phone aligned with the account profile.
create or replace function public.sync_self_subject_from_profile()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.role='patient' then
    update public.patient_subjects
    set full_name=coalesce(nullif(trim(new.full_name),''),full_name),
        phone=new.phone,
        updated_at=now()
    where owner_user_id=new.id and is_self=true;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_self_subject_from_profile_trigger on public.profiles;
create trigger sync_self_subject_from_profile_trigger
after update of full_name,phone on public.profiles
for each row execute function public.sync_self_subject_from_profile();

-- ---------------------------------------------------------------------------
-- 2. Add healthcare subject identity to patient-specific data
-- ---------------------------------------------------------------------------

alter table public.appointments add column if not exists subject_id uuid references public.patient_subjects(id) on delete restrict;
alter table public.hospital_appointments add column if not exists subject_id uuid references public.patient_subjects(id) on delete restrict;
alter table public.consultations add column if not exists subject_id uuid references public.patient_subjects(id) on delete restrict;
alter table public.referrals add column if not exists subject_id uuid references public.patient_subjects(id) on delete restrict;
alter table public.record_consents add column if not exists subject_id uuid references public.patient_subjects(id) on delete restrict;
alter table public.record_access_log add column if not exists subject_id uuid references public.patient_subjects(id) on delete restrict;
alter table public.patient_allergies add column if not exists subject_id uuid references public.patient_subjects(id) on delete restrict;
alter table public.patient_conditions add column if not exists subject_id uuid references public.patient_subjects(id) on delete restrict;
alter table public.patient_medications add column if not exists subject_id uuid references public.patient_subjects(id) on delete restrict;
alter table public.patient_surgeries add column if not exists subject_id uuid references public.patient_subjects(id) on delete restrict;
alter table public.patient_immunizations add column if not exists subject_id uuid references public.patient_subjects(id) on delete restrict;
alter table public.patient_family_history add column if not exists subject_id uuid references public.patient_subjects(id) on delete restrict;
alter table public.patient_vitals add column if not exists subject_id uuid references public.patient_subjects(id) on delete restrict;
alter table public.patient_consultation_ai_explanations add column if not exists subject_id uuid references public.patient_subjects(id) on delete restrict;
alter table public.patient_consultation_ai_messages add column if not exists subject_id uuid references public.patient_subjects(id) on delete restrict;
alter table public.medical_reports add column if not exists subject_id uuid references public.patient_subjects(id) on delete restrict;
alter table public.followup_reminders add column if not exists subject_id uuid references public.patient_subjects(id) on delete restrict;
alter table public.pharmacy_requests add column if not exists subject_id uuid references public.patient_subjects(id) on delete restrict;
alter table public.diagnostic_requests add column if not exists subject_id uuid references public.patient_subjects(id) on delete restrict;
alter table public.record_access_requests add column if not exists subject_id uuid references public.patient_subjects(id) on delete restrict;
alter table public.care_plans add column if not exists subject_id uuid references public.patient_subjects(id) on delete restrict;
alter table public.emergency_arrival_requests add column if not exists subject_id uuid references public.patient_subjects(id) on delete restrict;

-- Backfill all historic rows to the account holder's Self subject.
-- Existing application UPDATE triggers may validate historical rows for reasons unrelated
-- to this identity backfill (for example, old appointments linked to doctors that are no
-- longer verified). v33.2 temporarily disables USER triggers only while writing the new
-- subject_id column. PostgreSQL internal constraint/FK triggers remain enabled.
--
-- This occurs inside the surrounding transaction; if anything fails, trigger state and
-- data changes are rolled back together.
alter table public.appointments disable trigger user;
alter table public.hospital_appointments disable trigger user;
alter table public.consultations disable trigger user;
alter table public.referrals disable trigger user;
alter table public.record_consents disable trigger user;
alter table public.record_access_log disable trigger user;
alter table public.patient_allergies disable trigger user;
alter table public.patient_conditions disable trigger user;
alter table public.patient_medications disable trigger user;
alter table public.patient_surgeries disable trigger user;
alter table public.patient_immunizations disable trigger user;
alter table public.patient_family_history disable trigger user;
alter table public.patient_vitals disable trigger user;
alter table public.patient_consultation_ai_explanations disable trigger user;
alter table public.patient_consultation_ai_messages disable trigger user;
alter table public.medical_reports disable trigger user;
alter table public.followup_reminders disable trigger user;
alter table public.pharmacy_requests disable trigger user;
alter table public.diagnostic_requests disable trigger user;
alter table public.record_access_requests disable trigger user;
alter table public.care_plans disable trigger user;
alter table public.emergency_arrival_requests disable trigger user;

update public.appointments x set subject_id=public.my_self_subject_id(x.patient_id) where subject_id is null;
update public.hospital_appointments x set subject_id=public.my_self_subject_id(x.patient_id) where subject_id is null;
update public.consultations x set subject_id=public.my_self_subject_id(x.patient_id) where subject_id is null;
update public.referrals x set subject_id=public.my_self_subject_id(x.patient_id) where subject_id is null;
update public.record_consents x set subject_id=public.my_self_subject_id(x.patient_id) where subject_id is null;
update public.record_access_log x set subject_id=public.my_self_subject_id(x.patient_id) where subject_id is null;
update public.patient_allergies x set subject_id=public.my_self_subject_id(x.patient_id) where subject_id is null;
update public.patient_conditions x set subject_id=public.my_self_subject_id(x.patient_id) where subject_id is null;
update public.patient_medications x set subject_id=public.my_self_subject_id(x.patient_id) where subject_id is null;
update public.patient_surgeries x set subject_id=public.my_self_subject_id(x.patient_id) where subject_id is null;
update public.patient_immunizations x set subject_id=public.my_self_subject_id(x.patient_id) where subject_id is null;
update public.patient_family_history x set subject_id=public.my_self_subject_id(x.patient_id) where subject_id is null;
update public.patient_vitals x set subject_id=public.my_self_subject_id(x.patient_id) where subject_id is null;
update public.patient_consultation_ai_explanations x set subject_id=public.my_self_subject_id(x.patient_id) where subject_id is null;
update public.patient_consultation_ai_messages x set subject_id=public.my_self_subject_id(x.patient_id) where subject_id is null;
update public.medical_reports x set subject_id=public.my_self_subject_id(x.patient_id) where subject_id is null;
update public.followup_reminders x set subject_id=public.my_self_subject_id(x.patient_id) where subject_id is null;
update public.pharmacy_requests x set subject_id=public.my_self_subject_id(x.patient_id) where subject_id is null;
update public.diagnostic_requests x set subject_id=public.my_self_subject_id(x.patient_id) where subject_id is null;
update public.record_access_requests x set subject_id=public.my_self_subject_id(x.patient_id) where subject_id is null;
update public.care_plans x set subject_id=public.my_self_subject_id(x.patient_id) where subject_id is null;
update public.emergency_arrival_requests x set subject_id=public.my_self_subject_id(x.patient_id) where subject_id is null;

alter table public.appointments enable trigger user;
alter table public.hospital_appointments enable trigger user;
alter table public.consultations enable trigger user;
alter table public.referrals enable trigger user;
alter table public.record_consents enable trigger user;
alter table public.record_access_log enable trigger user;
alter table public.patient_allergies enable trigger user;
alter table public.patient_conditions enable trigger user;
alter table public.patient_medications enable trigger user;
alter table public.patient_surgeries enable trigger user;
alter table public.patient_immunizations enable trigger user;
alter table public.patient_family_history enable trigger user;
alter table public.patient_vitals enable trigger user;
alter table public.patient_consultation_ai_explanations enable trigger user;
alter table public.patient_consultation_ai_messages enable trigger user;
alter table public.medical_reports enable trigger user;
alter table public.followup_reminders enable trigger user;
alter table public.pharmacy_requests enable trigger user;
alter table public.diagnostic_requests enable trigger user;
alter table public.record_access_requests enable trigger user;
alter table public.care_plans enable trigger user;
alter table public.emergency_arrival_requests enable trigger user;

-- Every patient-specific row must now identify the actual person receiving care.
alter table public.appointments alter column subject_id set not null;
alter table public.hospital_appointments alter column subject_id set not null;
alter table public.consultations alter column subject_id set not null;
alter table public.referrals alter column subject_id set not null;
alter table public.record_consents alter column subject_id set not null;
alter table public.record_access_log alter column subject_id set not null;
alter table public.patient_allergies alter column subject_id set not null;
alter table public.patient_conditions alter column subject_id set not null;
alter table public.patient_medications alter column subject_id set not null;
alter table public.patient_surgeries alter column subject_id set not null;
alter table public.patient_immunizations alter column subject_id set not null;
alter table public.patient_family_history alter column subject_id set not null;
alter table public.patient_vitals alter column subject_id set not null;
alter table public.patient_consultation_ai_explanations alter column subject_id set not null;
alter table public.patient_consultation_ai_messages alter column subject_id set not null;
alter table public.medical_reports alter column subject_id set not null;
alter table public.followup_reminders alter column subject_id set not null;
alter table public.pharmacy_requests alter column subject_id set not null;
alter table public.diagnostic_requests alter column subject_id set not null;
alter table public.record_access_requests alter column subject_id set not null;
alter table public.care_plans alter column subject_id set not null;
alter table public.emergency_arrival_requests alter column subject_id set not null;

-- Subject indexes for fast family switching.
create index if not exists appointments_patient_subject_idx on public.appointments(patient_id,subject_id,appointment_start desc);
create index if not exists hospital_appointments_patient_subject_idx on public.hospital_appointments(patient_id,subject_id,requested_start desc);
create index if not exists consultations_patient_subject_idx on public.consultations(patient_id,subject_id,created_at desc);
create index if not exists referrals_patient_subject_idx on public.referrals(patient_id,subject_id,created_at desc);
create index if not exists medical_reports_patient_subject_idx on public.medical_reports(patient_id,subject_id,created_at desc);
create index if not exists followup_reminders_patient_subject_idx on public.followup_reminders(patient_id,subject_id,follow_up_date);
create index if not exists diagnostic_requests_patient_subject_idx on public.diagnostic_requests(patient_id,subject_id,requested_at desc);
create index if not exists pharmacy_requests_patient_subject_idx on public.pharmacy_requests(patient_id,subject_id,requested_at desc);
create index if not exists care_plans_patient_subject_idx on public.care_plans(patient_id,subject_id,created_at desc);
create index if not exists record_consents_patient_subject_idx on public.record_consents(patient_id,subject_id,granted_at desc);
create index if not exists patient_allergies_patient_subject_idx on public.patient_allergies(patient_id,subject_id,created_at desc);
create index if not exists patient_conditions_patient_subject_idx on public.patient_conditions(patient_id,subject_id,created_at desc);
create index if not exists patient_medications_patient_subject_idx on public.patient_medications(patient_id,subject_id,created_at desc);
create index if not exists patient_vitals_patient_subject_idx on public.patient_vitals(patient_id,subject_id,measured_at desc);
create index if not exists record_access_requests_patient_subject_idx on public.record_access_requests(patient_id,subject_id,created_at desc);
create index if not exists emergency_arrival_patient_subject_idx on public.emergency_arrival_requests(patient_id,subject_id,created_at desc);

-- ---------------------------------------------------------------------------
-- 3. Enforce patient_id/subject_id ownership at the database boundary
-- ---------------------------------------------------------------------------

create or replace function public.enforce_patient_subject_pair()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.patient_id is null then
    raise exception 'Patient account is required';
  end if;

  if new.subject_id is null then
    new.subject_id := public.my_self_subject_id(new.patient_id);
  end if;

  if new.subject_id is null or not exists (
    select 1 from public.patient_subjects s
    where s.id=new.subject_id
      and s.owner_user_id=new.patient_id
      and s.is_active=true
  ) then
    raise exception 'Healthcare profile does not belong to this patient account';
  end if;

  return new;
end;
$$;

-- Generic ownership enforcement for directly-created patient rows.
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'appointments','hospital_appointments','record_consents','record_access_log',
    'patient_allergies','patient_conditions','patient_medications','patient_surgeries',
    'patient_immunizations','patient_family_history','patient_vitals',
    'record_access_requests','diagnostic_requests','emergency_arrival_requests'
  ]
  loop
    execute format('drop trigger if exists z_enforce_patient_subject_pair on public.%I',tbl);
    execute format(
      'create trigger z_enforce_patient_subject_pair before insert or update of patient_id,subject_id on public.%I for each row execute function public.enforce_patient_subject_pair()',
      tbl
    );
  end loop;
end $$;

create or replace function public.protect_subject_identity()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.subject_id is distinct from old.subject_id then
    raise exception 'Healthcare profile identity cannot be changed after creation';
  end if;
  return new;
end;
$$;

-- Rows that are clinically derived from another record inherit its subject.
create or replace function public.sync_consultation_subject()
returns trigger language plpgsql security definer set search_path=public as $$
declare a public.appointments%rowtype;
begin
  select * into a from public.appointments where id=new.appointment_id;
  if not found then raise exception 'Appointment not found'; end if;
  new.patient_id:=a.patient_id;
  new.subject_id:=a.subject_id;
  return new;
end; $$;

drop trigger if exists a_sync_consultation_subject on public.consultations;
create trigger a_sync_consultation_subject before insert or update of appointment_id on public.consultations
for each row execute function public.sync_consultation_subject();
drop trigger if exists z_protect_consultation_subject on public.consultations;
create trigger z_protect_consultation_subject before update on public.consultations
for each row execute function public.protect_subject_identity();

create or replace function public.sync_referral_subject()
returns trigger language plpgsql security definer set search_path=public as $$
declare a public.appointments%rowtype;
begin
  select * into a from public.appointments where id=new.source_appointment_id;
  if not found then raise exception 'Source appointment not found'; end if;
  new.patient_id:=a.patient_id;
  new.subject_id:=a.subject_id;
  return new;
end; $$;

drop trigger if exists a_sync_referral_subject on public.referrals;
create trigger a_sync_referral_subject before insert on public.referrals
for each row execute function public.sync_referral_subject();
drop trigger if exists z_protect_referral_subject on public.referrals;
create trigger z_protect_referral_subject before update on public.referrals
for each row execute function public.protect_subject_identity();

-- Never link a referral to another family member's appointment.
create or replace function public.enforce_referral_booking_subject()
returns trigger language plpgsql security definer set search_path=public as $$
declare a_subject uuid;
begin
  if new.booked_appointment_id is not null then
    select subject_id into a_subject from public.appointments where id=new.booked_appointment_id;
    if a_subject is null or a_subject is distinct from new.subject_id then
      raise exception 'Referral and specialist appointment must belong to the same family profile';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists y_enforce_referral_booking_subject on public.referrals;
create trigger y_enforce_referral_booking_subject before insert or update of booked_appointment_id on public.referrals
for each row execute function public.enforce_referral_booking_subject();

create or replace function public.enforce_referral_shared_appointment_subject()
returns trigger language plpgsql security definer set search_path=public as $$
declare r_subject uuid; a_subject uuid;
begin
  select subject_id into r_subject from public.referrals where id=new.referral_id;
  select subject_id into a_subject from public.appointments where id=new.appointment_id;
  if r_subject is null or a_subject is null or r_subject is distinct from a_subject then
    raise exception 'Only records for the same family profile may be shared with this referral';
  end if;
  return new;
end; $$;

drop trigger if exists enforce_referral_shared_appointment_subject on public.referral_shared_appointments;
create trigger enforce_referral_shared_appointment_subject before insert or update on public.referral_shared_appointments
for each row execute function public.enforce_referral_shared_appointment_subject();

create or replace function public.sync_care_plan_subject()
returns trigger language plpgsql security definer set search_path=public as $$
declare a public.appointments%rowtype;
begin
  select * into a from public.appointments where id=new.source_appointment_id;
  if not found then raise exception 'Appointment not found'; end if;
  new.patient_id:=a.patient_id;
  new.subject_id:=a.subject_id;
  return new;
end; $$;

drop trigger if exists a_sync_care_plan_subject on public.care_plans;
create trigger a_sync_care_plan_subject before insert on public.care_plans
for each row execute function public.sync_care_plan_subject();
drop trigger if exists z_protect_care_plan_subject on public.care_plans;
create trigger z_protect_care_plan_subject before update on public.care_plans
for each row execute function public.protect_subject_identity();

create or replace function public.sync_followup_subject()
returns trigger language plpgsql security definer set search_path=public as $$
declare c public.consultations%rowtype;
begin
  select * into c from public.consultations where id=new.consultation_id;
  if not found then raise exception 'Consultation not found'; end if;
  new.patient_id:=c.patient_id;
  new.subject_id:=c.subject_id;
  return new;
end; $$;

drop trigger if exists a_sync_followup_subject on public.followup_reminders;
create trigger a_sync_followup_subject before insert or update of consultation_id on public.followup_reminders
for each row execute function public.sync_followup_subject();
drop trigger if exists z_protect_followup_subject on public.followup_reminders;
create trigger z_protect_followup_subject before update on public.followup_reminders
for each row execute function public.protect_subject_identity();

create or replace function public.sync_pharmacy_request_subject()
returns trigger language plpgsql security definer set search_path=public as $$
declare c public.consultations%rowtype;
begin
  select * into c from public.consultations where id=new.consultation_id;
  if not found then raise exception 'Consultation not found'; end if;
  new.patient_id:=c.patient_id;
  new.subject_id:=c.subject_id;
  return new;
end; $$;

drop trigger if exists a_sync_pharmacy_request_subject on public.pharmacy_requests;
create trigger a_sync_pharmacy_request_subject before insert on public.pharmacy_requests
for each row execute function public.sync_pharmacy_request_subject();
drop trigger if exists z_protect_pharmacy_request_subject on public.pharmacy_requests;
create trigger z_protect_pharmacy_request_subject before update on public.pharmacy_requests
for each row execute function public.protect_subject_identity();

create or replace function public.sync_medical_report_subject()
returns trigger language plpgsql security definer set search_path=public as $$
declare owner_id uuid; linked_subject uuid;
begin
  if new.appointment_id is not null then
    select patient_id,subject_id into owner_id,linked_subject
    from public.appointments where id=new.appointment_id;
    if owner_id is null then raise exception 'Appointment not found'; end if;
    if new.patient_id is distinct from owner_id then raise exception 'Report and appointment patient account mismatch'; end if;
    if new.subject_id is not null and new.subject_id is distinct from linked_subject then
      raise exception 'Report and appointment belong to different family profiles';
    end if;
    new.subject_id:=linked_subject;
  elsif new.diagnostic_request_id is not null then
    select patient_id,subject_id into owner_id,linked_subject
    from public.diagnostic_requests where id=new.diagnostic_request_id;
    if owner_id is null then raise exception 'Diagnostic request not found'; end if;
    if new.patient_id is distinct from owner_id then raise exception 'Report and diagnostic patient account mismatch'; end if;
    if new.subject_id is not null and new.subject_id is distinct from linked_subject then
      raise exception 'Report and diagnostic request belong to different family profiles';
    end if;
    new.subject_id:=linked_subject;
  end if;

  if new.subject_id is null then
    new.subject_id:=public.my_self_subject_id(new.patient_id);
  end if;

  if not exists (
    select 1 from public.patient_subjects s
    where s.id=new.subject_id and s.owner_user_id=new.patient_id and s.is_active=true
  ) then
    raise exception 'Invalid family profile for report';
  end if;

  return new;
end; $$;

drop trigger if exists a_sync_medical_report_subject on public.medical_reports;
create trigger a_sync_medical_report_subject before insert or update of appointment_id,diagnostic_request_id on public.medical_reports
for each row execute function public.sync_medical_report_subject();
drop trigger if exists z_protect_medical_report_subject on public.medical_reports;
create trigger z_protect_medical_report_subject before update on public.medical_reports
for each row execute function public.protect_subject_identity();

create or replace function public.sync_patient_ai_subject_from_appointment()
returns trigger language plpgsql security definer set search_path=public as $$
declare a public.appointments%rowtype;
begin
  select * into a from public.appointments where id=new.appointment_id;
  if not found then raise exception 'Appointment not found'; end if;
  new.patient_id:=a.patient_id;
  new.subject_id:=a.subject_id;
  return new;
end; $$;

drop trigger if exists a_sync_patient_ai_explanation_subject on public.patient_consultation_ai_explanations;
create trigger a_sync_patient_ai_explanation_subject before insert or update of appointment_id on public.patient_consultation_ai_explanations
for each row execute function public.sync_patient_ai_subject_from_appointment();
drop trigger if exists a_sync_patient_ai_message_subject on public.patient_consultation_ai_messages;
create trigger a_sync_patient_ai_message_subject before insert or update of appointment_id on public.patient_consultation_ai_messages
for each row execute function public.sync_patient_ai_subject_from_appointment();

-- ---------------------------------------------------------------------------
-- 4. Subject visibility for related providers
-- ---------------------------------------------------------------------------

create or replace function public.can_view_patient_subject(target_subject uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists (
    select 1
    from public.patient_subjects s
    where s.id=target_subject
      and (
        s.owner_user_id=auth.uid()
        or public.is_admin()
        or exists (select 1 from public.appointments a where a.subject_id=s.id and a.doctor_id=auth.uid())
        or exists (select 1 from public.hospital_appointments h where h.subject_id=s.id and h.hospital_id=auth.uid())
        or exists (select 1 from public.referrals r where r.subject_id=s.id and (r.from_doctor_id=auth.uid() or r.to_doctor_id=auth.uid()))
        or exists (select 1 from public.diagnostic_requests d where d.subject_id=s.id and d.lab_id=auth.uid())
        or exists (select 1 from public.pharmacy_requests pr where pr.subject_id=s.id and pr.pharmacy_id=auth.uid())
        or exists (select 1 from public.emergency_arrival_requests er where er.subject_id=s.id and er.hospital_id=auth.uid())
        or exists (select 1 from public.care_plans cp where cp.subject_id=s.id and cp.doctor_id=auth.uid())
        or exists (
          select 1 from public.record_consents rc
          where rc.subject_id=s.id and rc.doctor_id=auth.uid() and rc.status='active'
            and (rc.expires_at is null or rc.expires_at>now())
        )
      )
  );
$$;

revoke all on function public.can_view_patient_subject(uuid) from public;
grant execute on function public.can_view_patient_subject(uuid) to authenticated;

drop policy if exists "Patient subject visibility" on public.patient_subjects;
create policy "Patient subject visibility"
on public.patient_subjects for select to authenticated
using (public.can_view_patient_subject(id));

-- Minimise provider-visible family-profile data. Account owners use the secure
-- list_my_patient_subjects() RPC for the full row they manage.
revoke select on public.patient_subjects from anon,authenticated;
grant select (
  id,owner_user_id,full_name,relationship,date_of_birth,gender,blood_group,
  is_self,is_active,created_at,updated_at
) on public.patient_subjects to authenticated;

-- Direct writes are intentionally routed through secure RPCs.
revoke insert,update,delete on public.patient_subjects from anon,authenticated;

-- ---------------------------------------------------------------------------
-- 5. Subject-specific consent — prevents one family member's consent exposing another
-- ---------------------------------------------------------------------------

create or replace function public.has_record_consent(
  target_patient uuid,
  target_subject uuid,
  required_scope text
)
returns boolean
language sql
security definer
set search_path=public
stable
as $$
  select exists (
    select 1
    from public.record_consents rc
    where rc.patient_id=target_patient
      and rc.subject_id=target_subject
      and rc.doctor_id=auth.uid()
      and rc.status='active'
      and required_scope=any(rc.scopes)
      and (rc.expires_at is null or rc.expires_at>now())
      and public.is_verified_doctor(auth.uid())
  );
$$;

revoke all on function public.has_record_consent(uuid,uuid,text) from public;
grant execute on function public.has_record_consent(uuid,uuid,text) to authenticated;

-- Keep the old two-argument helper only for legacy Self-profile compatibility.
create or replace function public.has_record_consent(
  target_patient uuid,
  required_scope text
)
returns boolean
language sql
security definer
set search_path=public
stable
as $$
  select public.has_record_consent(
    target_patient,
    public.my_self_subject_id(target_patient),
    required_scope
  );
$$;

revoke all on function public.has_record_consent(uuid,text) from public;
grant execute on function public.has_record_consent(uuid,text) to authenticated;

-- Patient controls consents per selected family profile.
drop policy if exists "Patients can grant record consents" on public.record_consents;
create policy "Patients can grant record consents"
on public.record_consents for insert to authenticated
with check (
  patient_id=auth.uid()
  and public.is_my_patient_subject(subject_id)
  and public.is_verified_doctor(doctor_id)
);

drop policy if exists "Patients can update own record consents" on public.record_consents;
create policy "Patients can update own record consents"
on public.record_consents for update to authenticated
using (patient_id=auth.uid() or public.is_admin())
with check (
  (patient_id=auth.uid() and public.is_my_patient_subject(subject_id))
  or public.is_admin()
);

-- Appointments disclosed through consent must match the consented subject.
drop policy if exists "Doctors can view consented patient appointments" on public.appointments;
create policy "Doctors can view consented patient appointments"
on public.appointments for select to authenticated
using (
  auth.uid()=patient_id
  or auth.uid()=doctor_id
  or public.is_admin()
  or (
    status='completed'
    and public.has_record_consent(patient_id,subject_id,'consultations')
  )
);

-- Consultation consent is subject-specific.
drop policy if exists "Participants referral recipients or consented doctors can view consultations" on public.consultations;
create policy "Participants referral recipients or consented doctors can view consultations"
on public.consultations for select to authenticated
using (
  public.can_access_appointment(appointment_id)
  or public.can_view_shared_appointment(appointment_id)
  or public.has_record_consent(patient_id,subject_id,'consultations')
);

-- Prescription consent follows the consultation subject.
drop policy if exists "Participants or consented doctors can view prescription items" on public.prescription_items;
create policy "Participants or consented doctors can view prescription items"
on public.prescription_items for select to authenticated
using (
  public.can_access_consultation(consultation_id)
  or exists (
    select 1 from public.consultations c
    where c.id=consultation_id
      and public.has_record_consent(c.patient_id,c.subject_id,'prescriptions')
  )
);

-- Appointment file consent follows appointment subject.
drop policy if exists "Participants or consented doctors can view appointment files" on public.appointment_files;
create policy "Participants or consented doctors can view appointment files"
on public.appointment_files for select to authenticated
using (
  public.can_access_appointment(appointment_id)
  or exists (
    select 1 from public.appointments a
    where a.id=appointment_id
      and public.has_record_consent(a.patient_id,a.subject_id,'appointment_files')
  )
);

drop policy if exists "Participants or consented doctors can view appointment storage" on storage.objects;
create policy "Participants or consented doctors can view appointment storage"
on storage.objects for select to authenticated
using (
  bucket_id='Appointment files'
  and (
    public.can_access_appointment(((storage.foldername(name))[1])::uuid)
    or exists (
      select 1 from public.appointments a
      where a.id=((storage.foldername(name))[1])::uuid
        and public.has_record_consent(a.patient_id,a.subject_id,'appointment_files')
    )
  )
);

-- Referral consent is subject-specific.
drop policy if exists "Referral participants or consented doctors can view referrals" on public.referrals;
create policy "Referral participants or consented doctors can view referrals"
on public.referrals for select to authenticated
using (
  patient_id=auth.uid()
  or from_doctor_id=auth.uid()
  or to_doctor_id=auth.uid()
  or public.is_admin()
  or public.has_record_consent(patient_id,subject_id,'referrals')
);

-- Structured health profile policies: account owner can manage all owned subjects;
-- doctors only see the specifically consented subject.
do $$
declare tbl text;
begin
  foreach tbl in array array[
    'patient_allergies','patient_conditions','patient_medications','patient_surgeries',
    'patient_immunizations','patient_family_history'
  ] loop
    execute format('drop policy if exists "Patient can view own %1$s" on public.%1$I',tbl);
    execute format(
      'create policy "Patient can view own %1$s" on public.%1$I for select to authenticated using (patient_id=auth.uid() or public.has_record_consent(patient_id,subject_id,''health_profile'') or public.is_admin())',
      tbl
    );
    execute format('drop policy if exists "Patient can add own %1$s" on public.%1$I',tbl);
    execute format(
      'create policy "Patient can add own %1$s" on public.%1$I for insert to authenticated with check (patient_id=auth.uid() and public.is_my_patient_subject(subject_id))',
      tbl
    );
    execute format('drop policy if exists "Patient can update own %1$s" on public.%1$I',tbl);
    execute format(
      'create policy "Patient can update own %1$s" on public.%1$I for update to authenticated using (patient_id=auth.uid()) with check (patient_id=auth.uid() and public.is_my_patient_subject(subject_id))',
      tbl
    );
    execute format('drop policy if exists "Patient can delete own %1$s" on public.%1$I',tbl);
    execute format(
      'create policy "Patient can delete own %1$s" on public.%1$I for delete to authenticated using (patient_id=auth.uid())',
      tbl
    );
  end loop;
end $$;

drop policy if exists "Patient or consented doctor can view vitals" on public.patient_vitals;
create policy "Patient or consented doctor can view vitals"
on public.patient_vitals for select to authenticated
using (
  patient_id=auth.uid()
  or public.has_record_consent(patient_id,subject_id,'vitals')
  or public.is_admin()
);

drop policy if exists "Patient can add own vitals" on public.patient_vitals;
create policy "Patient can add own vitals"
on public.patient_vitals for insert to authenticated
with check (patient_id=auth.uid() and public.is_my_patient_subject(subject_id));

drop policy if exists "Patient can update own vitals" on public.patient_vitals;
create policy "Patient can update own vitals"
on public.patient_vitals for update to authenticated
using (patient_id=auth.uid())
with check (patient_id=auth.uid() and public.is_my_patient_subject(subject_id));

-- Medical report consent must match the report's subject.
create or replace function public.can_access_medical_report(target_report uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists (
    select 1 from public.medical_reports r
    where r.id=target_report
      and (
        r.patient_id=auth.uid()
        or public.is_admin()
        or exists (
          select 1 from public.appointments a
          where a.id=r.appointment_id and a.doctor_id=auth.uid()
        )
        or exists (
          select 1 from public.record_consents c
          where c.patient_id=r.patient_id
            and c.subject_id=r.subject_id
            and c.doctor_id=auth.uid()
            and c.status='active'
            and (c.expires_at is null or c.expires_at>now())
            and (
              'consultations'=any(c.scopes)
              or 'health_profile'=any(c.scopes)
            )
        )
      )
  );
$$;

-- Subject-aware audited record access.
drop function if exists public.log_record_access(uuid,text,text,uuid);

create or replace function public.log_record_access(
  target_patient uuid,
  requested_scope text,
  source_name text,
  source_reference uuid,
  target_subject uuid
)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if requested_scope not in (
    'consultations','prescriptions','appointment_files','referrals',
    'emergency_summary','record_overview','health_profile','vitals'
  ) then
    raise exception 'Invalid record access type';
  end if;

  if auth.uid() is null then raise exception 'Authentication required'; end if;

  if not exists (
    select 1 from public.patient_subjects s
    where s.id=target_subject and s.owner_user_id=target_patient
  ) then
    raise exception 'Invalid family profile';
  end if;

  if not (
    auth.uid()=target_patient
    or public.is_admin()
    or (
      requested_scope='record_overview'
      and exists (
        select 1 from public.record_consents rc
        where rc.patient_id=target_patient
          and rc.subject_id=target_subject
          and rc.doctor_id=auth.uid()
          and rc.status='active'
          and (rc.expires_at is null or rc.expires_at>now())
      )
    )
    or public.has_record_consent(target_patient,target_subject,requested_scope)
  ) then
    raise exception 'No active patient consent for this family profile and record type';
  end if;

  insert into public.record_access_log(
    patient_id,subject_id,accessor_id,access_type,source,reference_id
  ) values (
    target_patient,target_subject,auth.uid(),requested_scope,source_name,source_reference
  );
end;
$$;

revoke all on function public.log_record_access(uuid,text,text,uuid,uuid) from public;
grant execute on function public.log_record_access(uuid,text,text,uuid,uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Doctor access-request workflow becomes subject-specific
-- ---------------------------------------------------------------------------

drop function if exists public.request_patient_record_access(uuid,text[],text);

create or replace function public.request_patient_record_access(
  target_patient uuid,
  target_subject uuid,
  requested_scopes text[],
  request_reason text
)
returns public.record_access_requests
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.record_access_requests%rowtype;
  allowed_scopes constant text[] := array[
    'consultations','prescriptions','appointment_files','referrals',
    'emergency_summary','health_profile','vitals'
  ];
  scope_item text;
  care_relationship boolean := false;
begin
  if not exists (
    select 1 from public.profiles
    where id=auth.uid() and role='doctor' and verification_status='verified'
  ) then
    raise exception 'Only verified doctors can request record access';
  end if;

  if target_patient is null or not exists (
    select 1 from public.profiles where id=target_patient and role='patient'
  ) then
    raise exception 'Patient not found';
  end if;

  if not exists (
    select 1 from public.patient_subjects s
    where s.id=target_subject and s.owner_user_id=target_patient and s.is_active=true
  ) then
    raise exception 'Family profile not found';
  end if;

  if coalesce(array_length(requested_scopes,1),0)=0 then
    raise exception 'Select at least one record category';
  end if;

  foreach scope_item in array requested_scopes loop
    if not (scope_item=any(allowed_scopes)) then raise exception 'Invalid access scope'; end if;
  end loop;

  if char_length(trim(coalesce(request_reason,'')))<8 then
    raise exception 'Add a short reason for the access request';
  end if;

  select
    exists(
      select 1 from public.appointments
      where patient_id=target_patient and subject_id=target_subject and doctor_id=auth.uid()
    )
    or exists(
      select 1 from public.referrals
      where patient_id=target_patient and subject_id=target_subject
        and (from_doctor_id=auth.uid() or to_doctor_id=auth.uid())
    )
  into care_relationship;

  if not care_relationship then
    raise exception 'No MediBridge care relationship exists with this family profile';
  end if;

  update public.record_access_requests
  set status='cancelled',cancelled_at=now()
  where doctor_id=auth.uid()
    and patient_id=target_patient
    and subject_id=target_subject
    and status='pending';

  insert into public.record_access_requests(
    patient_id,subject_id,doctor_id,requested_scopes,reason,status
  ) values (
    target_patient,target_subject,auth.uid(),requested_scopes,trim(request_reason),'pending'
  ) returning * into r;

  perform public.push_notification(
    target_patient,
    'record_access_request',
    'Doctor requested record access',
    'A doctor requested access to records for one of your family profiles.',
    'access_request',
    r.id
  );

  return r;
end;
$$;

revoke all on function public.request_patient_record_access(uuid,uuid,text[],text) from public;
grant execute on function public.request_patient_record_access(uuid,uuid,text[],text) to authenticated;

drop function if exists public.respond_patient_record_access_request(uuid,boolean,integer);

create or replace function public.respond_patient_record_access_request(
  target_request uuid,
  approve_request boolean,
  consent_hours integer default 168,
  approved_scopes text[] default null
)
returns public.record_access_requests
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.record_access_requests%rowtype;
  expires_at_value timestamptz;
  effective_scopes text[];
  scope_item text;
begin
  select * into r
  from public.record_access_requests
  where id=target_request and patient_id=auth.uid() and status='pending'
  for update;

  if not found then raise exception 'Pending access request not found'; end if;

  if not public.is_my_patient_subject(r.subject_id) then
    raise exception 'Family profile is not available';
  end if;

  if approve_request then
    effective_scopes:=coalesce(approved_scopes,r.requested_scopes);
    if coalesce(array_length(effective_scopes,1),0)=0 then
      raise exception 'Choose at least one record category to share';
    end if;

    foreach scope_item in array effective_scopes loop
      if not (scope_item=any(r.requested_scopes)) then
        raise exception 'You can approve only record categories requested by the doctor';
      end if;
    end loop;

    if consent_hours=0 then
      expires_at_value:=null;
    elsif consent_hours between 1 and 8760 then
      expires_at_value:=now()+make_interval(hours=>consent_hours);
    else
      raise exception 'Invalid consent duration';
    end if;

    update public.record_consents
    set status='revoked',revoked_at=now()
    where patient_id=auth.uid()
      and subject_id=r.subject_id
      and doctor_id=r.doctor_id
      and status='active';

    insert into public.record_consents(
      patient_id,subject_id,doctor_id,scopes,expires_at,status
    ) values (
      auth.uid(),r.subject_id,r.doctor_id,effective_scopes,expires_at_value,'active'
    );

    update public.record_access_requests
    set status='approved',responded_at=now()
    where id=r.id returning * into r;

    perform public.push_notification(
      r.doctor_id,'record_access_approved','Record access approved',
      'The patient approved selected MediBridge record access.',
      'access_request',r.id
    );
  else
    update public.record_access_requests
    set status='declined',responded_at=now()
    where id=r.id returning * into r;

    perform public.push_notification(
      r.doctor_id,'record_access_declined','Record access declined',
      'The patient declined your requested MediBridge record access.',
      'access_request',r.id
    );
  end if;

  return r;
end;
$$;

revoke all on function public.respond_patient_record_access_request(uuid,boolean,integer,text[]) from public;
grant execute on function public.respond_patient_record_access_request(uuid,boolean,integer,text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Family-aware diagnostics creation RPC
-- ---------------------------------------------------------------------------

drop function if exists public.create_diagnostic_request(uuid,uuid[],date,time,text);

create or replace function public.create_diagnostic_request(
  target_subject uuid,
  target_lab uuid,
  target_test_ids uuid[],
  target_date date default null,
  target_time time default null,
  request_note text default null
)
returns public.diagnostic_requests
language plpgsql
security definer
set search_path=public
as $$
declare
  req public.diagnostic_requests%rowtype;
  requested_count integer;
  valid_count integer;
begin
  if not public.is_my_patient_subject(target_subject) then
    raise exception 'Choose a valid family profile';
  end if;

  if not exists (
    select 1 from public.profiles p
    join public.lab_profiles l on l.id=p.id
    where p.id=target_lab and p.role='lab' and p.verification_status='verified'
  ) then
    raise exception 'Verified diagnostic centre required';
  end if;

  requested_count:=coalesce(array_length(target_test_ids,1),0);
  if requested_count=0 then raise exception 'Select at least one test'; end if;

  select count(*) into valid_count
  from public.lab_tests t
  where t.id=any(target_test_ids) and t.lab_id=target_lab and t.is_active=true;

  if valid_count<>requested_count then
    raise exception 'One or more selected tests are not available at this centre';
  end if;

  insert into public.diagnostic_requests(
    patient_id,subject_id,lab_id,requested_date,preferred_time,patient_note
  ) values (
    auth.uid(),target_subject,target_lab,target_date,target_time,nullif(trim(request_note),'')
  ) returning * into req;

  insert into public.diagnostic_request_items(
    request_id,lab_test_id,test_name,category,sample_or_modality,indicative_price
  )
  select req.id,t.id,t.test_name,t.category,t.sample_or_modality,t.indicative_price
  from public.lab_tests t
  where t.id=any(target_test_ids) and t.lab_id=target_lab and t.is_active=true;

  return req;
end;
$$;

revoke all on function public.create_diagnostic_request(uuid,uuid,uuid[],date,time,text) from public;
grant execute on function public.create_diagnostic_request(uuid,uuid,uuid[],date,time,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Provider-safe subject summaries
-- ---------------------------------------------------------------------------

create or replace function public.get_patient_subject_summary(target_subject uuid)
returns table (
  id uuid,
  owner_user_id uuid,
  full_name text,
  relationship text,
  date_of_birth date,
  gender text,
  blood_group text,
  is_self boolean
)
language sql
stable
security definer
set search_path=public
as $$
  select
    s.id,s.owner_user_id,s.full_name,s.relationship,s.date_of_birth,s.gender,
    s.blood_group,s.is_self
  from public.patient_subjects s
  where s.id=target_subject and public.can_view_patient_subject(s.id);
$$;

revoke all on function public.get_patient_subject_summary(uuid) from public;
grant execute on function public.get_patient_subject_summary(uuid) to authenticated;

create or replace function public.get_patient_subject_emergency_summary(target_subject uuid)
returns table (
  blood_group text,
  emergency_contact_name text,
  emergency_contact_phone text
)
language sql
stable
security definer
set search_path=public
as $$
  select s.blood_group,s.emergency_contact_name,s.emergency_contact_phone
  from public.patient_subjects s
  where s.id=target_subject
    and (
      s.owner_user_id=auth.uid()
      or public.is_admin()
      or public.has_record_consent(s.owner_user_id,s.id,'emergency_summary')
    );
$$;

revoke all on function public.get_patient_subject_emergency_summary(uuid) from public;
grant execute on function public.get_patient_subject_emergency_summary(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Ensure family subject remains immutable on remaining derived tables
-- ---------------------------------------------------------------------------

do $$
declare tbl text;
begin
  foreach tbl in array array[
    'appointments','hospital_appointments','record_consents','record_access_log',
    'patient_allergies','patient_conditions','patient_medications','patient_surgeries',
    'patient_immunizations','patient_family_history','patient_vitals',
    'record_access_requests','diagnostic_requests','emergency_arrival_requests',
    'patient_consultation_ai_explanations','patient_consultation_ai_messages'
  ] loop
    execute format('drop trigger if exists zz_protect_subject_identity on public.%I',tbl);
    execute format(
      'create trigger zz_protect_subject_identity before update on public.%I for each row execute function public.protect_subject_identity()',
      tbl
    );
  end loop;
end $$;

-- Existing rows remain Self by default. New v33 clients always send/derive subject_id.

-- ---------------------------------------------------------------------------
-- 10. Doctor pre-completion AI safety context follows the appointment subject
-- ---------------------------------------------------------------------------

create or replace function public.get_doctor_precompletion_patient_context(
  target_appointment uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  appt public.appointments%rowtype;
  subject public.patient_subjects%rowtype;
  result jsonb;
begin
  if not public.is_verified_doctor(auth.uid()) then
    raise exception 'Verified doctor required';
  end if;

  select * into appt
  from public.appointments
  where id=target_appointment
    and doctor_id=auth.uid()
    and status in ('booked','confirmed');

  if not found then
    raise exception 'Active assigned appointment not found';
  end if;

  select * into subject
  from public.patient_subjects
  where id=appt.subject_id and owner_user_id=appt.patient_id;

  if not found then
    raise exception 'Healthcare profile not found';
  end if;

  select jsonb_build_object(
    'appointment',jsonb_build_object(
      'id',appt.id,
      'patient_id',appt.patient_id,
      'subject_id',appt.subject_id,
      'subject_name',subject.full_name,
      'subject_relationship',subject.relationship,
      'appointment_start',appt.appointment_start,
      'consultation_type',appt.consultation_type,
      'reason_for_visit',appt.reason_for_visit,
      'status',appt.status
    ),
    'patient_profile',jsonb_build_object(
      'full_name',subject.full_name,
      'relationship',subject.relationship,
      'date_of_birth',subject.date_of_birth,
      'gender',subject.gender,
      'blood_group',subject.blood_group
    ),
    'allergies',coalesce((
      select jsonb_agg(to_jsonb(x)) from public.patient_allergies x
      where x.patient_id=appt.patient_id and x.subject_id=appt.subject_id
    ),'[]'::jsonb),
    'conditions',coalesce((
      select jsonb_agg(to_jsonb(x)) from public.patient_conditions x
      where x.patient_id=appt.patient_id and x.subject_id=appt.subject_id
    ),'[]'::jsonb),
    'current_medications',coalesce((
      select jsonb_agg(to_jsonb(x)) from public.patient_medications x
      where x.patient_id=appt.patient_id and x.subject_id=appt.subject_id
    ),'[]'::jsonb),
    'recent_vitals',coalesce((
      select jsonb_agg(to_jsonb(x))
      from (
        select * from public.patient_vitals
        where patient_id=appt.patient_id and subject_id=appt.subject_id
        order by measured_at desc limit 10
      ) x
    ),'[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_doctor_precompletion_patient_context(uuid) from public;
grant execute on function public.get_doctor_precompletion_patient_context(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Urgent referral auto-scheduling must preserve the referred family subject.
-- The v23.6 function predates subject_id and would otherwise default the internal
-- urgent appointment to Self. Re-define it with the same behavior plus subject_id.
-- -----------------------------------------------------------------------------
create or replace function public.accept_urgent_referral(
  target_referral uuid
)
returns public.referrals
language plpgsql
security definer
set search_path=public
as $$
declare
  r public.referrals%rowtype;
  candidate_start timestamptz;
  candidate_end timestamptz;
  deadline timestamptz;
  appt_id uuid;
begin
  select * into r
  from public.referrals
  where id=target_referral
    and to_doctor_id=auth.uid()
  for update;

  if not found then
    raise exception 'Referral not found';
  end if;

  if r.status <> 'patient_approved' then
    raise exception 'Referral is not waiting for specialist acceptance';
  end if;

  if r.urgency <> 'urgent' then
    raise exception 'This function is only for urgent referrals';
  end if;

  if r.subject_id is null then
    raise exception 'Referral patient profile is missing';
  end if;

  if not public.is_verified_doctor(auth.uid()) then
    raise exception 'Verified doctor required';
  end if;

  update public.referrals
  set status='accepted',
      updated_at=now()
  where id=r.id
  returning * into r;

  candidate_start :=
    date_trunc('minute', now() + interval '10 minutes')
    + make_interval(mins =>
        (5 - (extract(minute from (now() + interval '10 minutes'))::int % 5)) % 5
      );

  deadline := now() + interval '2 hours';

  while candidate_start + interval '20 minutes' <= deadline loop
    candidate_end := candidate_start + interval '20 minutes';

    if not exists (
      select 1
      from public.appointments a
      where a.doctor_id=r.to_doctor_id
        and a.status in ('booked','confirmed')
        and candidate_start < a.appointment_end
        and candidate_end > a.appointment_start
    ) then
      begin
        insert into public.appointments(
          patient_id,
          subject_id,
          doctor_id,
          appointment_start,
          appointment_end,
          consultation_type,
          reason_for_visit,
          status
        )
        values(
          r.patient_id,
          r.subject_id,
          r.to_doctor_id,
          candidate_start,
          candidate_end,
          'online',
          'URGENT REFERRAL: ' || coalesce(r.reason,'Specialist review'),
          'confirmed'
        )
        returning id into appt_id;

        perform set_config('medibridge.referral_booking_update','allowed',true);

        update public.referrals
        set booked_appointment_id=appt_id,
            booked_at=now(),
            status='booked',
            updated_at=now()
        where id=r.id
        returning * into r;

        return r;
      exception
        when exclusion_violation or unique_violation then
          null;
      end;
    end if;

    candidate_start := candidate_start + interval '5 minutes';
  end loop;

  return r;
end;
$$;

revoke all on function public.accept_urgent_referral(uuid) from public;
grant execute on function public.accept_urgent_referral(uuid)
to authenticated;

commit;
