-- MediBridge v37 — Mental Healthcare Foundation
begin;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
check (role in ('patient','doctor','hospital','pharmacy','lab','mental_health','admin'));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare requested_role text;
begin
  requested_role := coalesce(new.raw_user_meta_data->>'role','patient');
  if requested_role not in ('patient','doctor','hospital','pharmacy','lab','mental_health') then
    requested_role := 'patient';
  end if;
  insert into public.profiles(id,full_name,role,verification_status)
  values(
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    requested_role,
    case when requested_role='patient' then 'verified' else 'pending' end
  ) on conflict(id) do nothing;
  if requested_role='patient' then
    insert into public.patient_profiles(id) values(new.id) on conflict(id) do nothing;
  end if;
  return new;
end;
$$;

create table if not exists public.mental_health_provider_profiles(
  id uuid primary key references public.profiles(id) on delete cascade,
  professional_type text not null check (professional_type in ('psychiatrist','clinical_psychologist','counselling_psychologist','counsellor','therapist')),
  qualification text not null,
  registration_number text,
  registration_body text,
  years_experience integer check (years_experience is null or years_experience between 0 and 70),
  languages text[] not null default '{}',
  focus_areas text[] not null default '{}',
  consultation_modes text[] not null default array['online','in_person']::text[],
  bio text,
  clinic_name text,
  city text,
  district text,
  state text default 'Uttar Pradesh',
  google_maps_url text,
  fee_online numeric(10,2) check (fee_online is null or fee_online>=0),
  fee_in_person numeric(10,2) check (fee_in_person is null or fee_in_person>=0),
  accepting_new_clients boolean not null default true,
  verification_document_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.mental_health_provider_profiles enable row level security;

drop policy if exists "Mental provider profile read" on public.mental_health_provider_profiles;
create policy "Mental provider profile read" on public.mental_health_provider_profiles
for select to authenticated using (
  id=auth.uid() or public.is_admin() or exists(
    select 1 from public.profiles p where p.id=mental_health_provider_profiles.id and p.role='mental_health' and p.verification_status='verified'
  )
);
drop policy if exists "Mental provider profile insert" on public.mental_health_provider_profiles;
create policy "Mental provider profile insert" on public.mental_health_provider_profiles
for insert to authenticated with check (id=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='mental_health'));
drop policy if exists "Mental provider profile update" on public.mental_health_provider_profiles;
create policy "Mental provider profile update" on public.mental_health_provider_profiles
for update to authenticated using(id=auth.uid() or public.is_admin()) with check(id=auth.uid() or public.is_admin());

create table if not exists public.mental_health_appointments(
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.patient_subjects(id) on delete restrict,
  provider_id uuid not null references public.profiles(id) on delete restrict,
  requested_start timestamptz not null,
  consultation_type text not null check (consultation_type in ('online','in_person')),
  concern_category text not null check (concern_category in ('talk_to_someone','anxiety_stress','low_mood','sleep','relationship_family','addiction','child_adolescent','medication_review','other')),
  patient_note text,
  status text not null default 'requested' check (status in ('requested','confirmed','completed','declined','cancelled','no_show')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.mental_health_appointments enable row level security;
create index if not exists mental_health_appointments_patient_idx on public.mental_health_appointments(patient_id,requested_start desc);
create index if not exists mental_health_appointments_provider_idx on public.mental_health_appointments(provider_id,requested_start desc);
create index if not exists mental_health_appointments_subject_idx on public.mental_health_appointments(subject_id,requested_start desc);

create or replace function public.protect_mental_health_appointment()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    if auth.uid() is null or new.patient_id<>auth.uid() then raise exception 'Only the patient account can request a mental-health session'; end if;
    if not exists(select 1 from public.patient_subjects s where s.id=new.subject_id and s.account_owner_id=auth.uid() and s.status='active') then raise exception 'Invalid patient healthcare profile'; end if;
    if not exists(select 1 from public.profiles p where p.id=new.provider_id and p.role='mental_health' and p.verification_status='verified') then raise exception 'Mental-health professional is not verified'; end if;
    return new;
  end if;
  if new.patient_id is distinct from old.patient_id or new.subject_id is distinct from old.subject_id or new.provider_id is distinct from old.provider_id then raise exception 'Participants cannot be changed'; end if;
  if auth.uid()=old.patient_id then
    if new.status is distinct from old.status and not(old.status in ('requested','confirmed') and new.status='cancelled') then raise exception 'Patient can only cancel an active request'; end if;
  elsif auth.uid()=old.provider_id then
    if new.status is distinct from old.status and not((old.status='requested' and new.status in ('confirmed','declined')) or (old.status='confirmed' and new.status in ('completed','no_show','cancelled'))) then raise exception 'Invalid mental-health appointment transition'; end if;
  elsif not public.is_admin() then raise exception 'Not authorised'; end if;
  new.updated_at=now(); return new;
end;
$$;
drop trigger if exists protect_mental_health_appointment on public.mental_health_appointments;
create trigger protect_mental_health_appointment before insert or update on public.mental_health_appointments for each row execute function public.protect_mental_health_appointment();

drop policy if exists "Mental appointment read" on public.mental_health_appointments;
create policy "Mental appointment read" on public.mental_health_appointments for select to authenticated using(patient_id=auth.uid() or provider_id=auth.uid() or public.is_admin());
drop policy if exists "Mental appointment insert" on public.mental_health_appointments;
create policy "Mental appointment insert" on public.mental_health_appointments for insert to authenticated with check(patient_id=auth.uid());
drop policy if exists "Mental appointment update" on public.mental_health_appointments;
create policy "Mental appointment update" on public.mental_health_appointments for update to authenticated using(patient_id=auth.uid() or provider_id=auth.uid() or public.is_admin()) with check(patient_id=auth.uid() or provider_id=auth.uid() or public.is_admin());

create table if not exists public.mental_health_session_summaries(
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.mental_health_appointments(id) on delete cascade,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.patient_subjects(id) on delete restrict,
  provider_id uuid not null references public.profiles(id) on delete restrict,
  patient_summary text,
  care_plan text,
  follow_up_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.mental_health_session_summaries enable row level security;

create or replace function public.protect_mental_health_summary()
returns trigger language plpgsql security definer set search_path=public as $$
declare a public.mental_health_appointments;
begin
  select * into a from public.mental_health_appointments where id=new.appointment_id;
  if a.id is null then raise exception 'Mental-health appointment not found'; end if;
  if auth.uid()<>a.provider_id and not public.is_admin() then raise exception 'Only the assigned professional can write the session summary'; end if;
  new.patient_id=a.patient_id; new.subject_id=a.subject_id; new.provider_id=a.provider_id; new.updated_at=now(); return new;
end;
$$;
drop trigger if exists protect_mental_health_summary on public.mental_health_session_summaries;
create trigger protect_mental_health_summary before insert or update on public.mental_health_session_summaries for each row execute function public.protect_mental_health_summary();

drop policy if exists "Mental summary participant read" on public.mental_health_session_summaries;
create policy "Mental summary participant read" on public.mental_health_session_summaries for select to authenticated using(patient_id=auth.uid() or provider_id=auth.uid() or public.is_admin());
drop policy if exists "Mental summary provider insert" on public.mental_health_session_summaries;
create policy "Mental summary provider insert" on public.mental_health_session_summaries for insert to authenticated with check(provider_id=auth.uid() or public.is_admin());
drop policy if exists "Mental summary provider update" on public.mental_health_session_summaries;
create policy "Mental summary provider update" on public.mental_health_session_summaries for update to authenticated using(provider_id=auth.uid() or public.is_admin()) with check(provider_id=auth.uid() or public.is_admin());

create table if not exists public.mental_health_private_notes(
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.mental_health_appointments(id) on delete cascade,
  provider_id uuid not null references public.profiles(id) on delete cascade,
  private_note text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.mental_health_private_notes enable row level security;
drop policy if exists "Mental provider owns private notes" on public.mental_health_private_notes;
create policy "Mental provider owns private notes" on public.mental_health_private_notes for all to authenticated
using(provider_id=auth.uid() or public.is_admin())
with check((provider_id=auth.uid() and exists(select 1 from public.mental_health_appointments a where a.id=appointment_id and a.provider_id=auth.uid())) or public.is_admin());

create table if not exists public.mental_health_consents(
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.patient_subjects(id) on delete cascade,
  provider_id uuid not null references public.profiles(id) on delete cascade,
  scopes text[] not null default array['session_summaries']::text[],
  status text not null default 'active' check(status in ('active','revoked')),
  expires_at timestamptz,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(patient_id,subject_id,provider_id)
);
alter table public.mental_health_consents enable row level security;

create or replace function public.validate_mental_health_consent()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid()<>new.patient_id and not public.is_admin() then raise exception 'Only the patient account can manage mental-health consent'; end if;
  if not exists(select 1 from public.patient_subjects s where s.id=new.subject_id and s.account_owner_id=new.patient_id and s.status='active') then raise exception 'Invalid patient healthcare profile'; end if;
  if not exists(select 1 from public.profiles p where p.id=new.provider_id and p.role='mental_health' and p.verification_status='verified') then raise exception 'Target mental-health professional is not verified'; end if;
  if exists(select 1 from unnest(new.scopes) scope where scope not in ('session_summaries')) then raise exception 'Unsupported mental-health consent scope'; end if;
  return new;
end;
$$;
drop trigger if exists validate_mental_health_consent on public.mental_health_consents;
create trigger validate_mental_health_consent before insert or update on public.mental_health_consents for each row execute function public.validate_mental_health_consent();

drop policy if exists "Patient manages mental consent" on public.mental_health_consents;
create policy "Patient manages mental consent" on public.mental_health_consents for all to authenticated using(patient_id=auth.uid() or public.is_admin()) with check(patient_id=auth.uid() or public.is_admin());
drop policy if exists "Target provider sees mental consent" on public.mental_health_consents;
create policy "Target provider sees mental consent" on public.mental_health_consents for select to authenticated using(provider_id=auth.uid() or patient_id=auth.uid() or public.is_admin());

create table if not exists public.mental_health_access_log(
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.patient_subjects(id) on delete cascade,
  provider_id uuid not null references public.profiles(id) on delete cascade,
  access_type text not null,
  accessed_at timestamptz not null default now()
);
alter table public.mental_health_access_log enable row level security;
drop policy if exists "Mental access log participant read" on public.mental_health_access_log;
create policy "Mental access log participant read" on public.mental_health_access_log for select to authenticated using(patient_id=auth.uid() or provider_id=auth.uid() or public.is_admin());

create or replace function public.get_shared_mental_health_summaries(target_subject uuid)
returns table(id uuid,appointment_id uuid,provider_id uuid,provider_name text,patient_summary text,care_plan text,follow_up_date date,created_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare owner_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='mental_health' and p.verification_status='verified') then raise exception 'Verified mental-health professional required'; end if;
  select s.account_owner_id into owner_id from public.patient_subjects s where s.id=target_subject and s.status='active';
  if owner_id is null then raise exception 'Patient profile not found'; end if;
  if not exists(select 1 from public.mental_health_consents c where c.patient_id=owner_id and c.subject_id=target_subject and c.provider_id=auth.uid() and c.status='active' and 'session_summaries'=any(c.scopes) and (c.expires_at is null or c.expires_at>now())) then raise exception 'Active mental-health consent required'; end if;
  insert into public.mental_health_access_log(patient_id,subject_id,provider_id,access_type) values(owner_id,target_subject,auth.uid(),'session_summaries');
  return query
  select s.id,s.appointment_id,s.provider_id,coalesce(p.full_name,'Mental-health professional'),s.patient_summary,s.care_plan,s.follow_up_date,s.created_at
  from public.mental_health_session_summaries s join public.profiles p on p.id=s.provider_id
  where s.subject_id=target_subject order by s.created_at desc;
end;
$$;
revoke all on function public.get_shared_mental_health_summaries(uuid) from public,anon;
grant execute on function public.get_shared_mental_health_summaries(uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('Mental health verification','Mental health verification',false,10485760,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Mental provider uploads own verification" on storage.objects;
create policy "Mental provider uploads own verification" on storage.objects for insert to authenticated
with check(bucket_id='Mental health verification' and (storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='mental_health'));
drop policy if exists "Mental provider reads verification" on storage.objects;
create policy "Mental provider reads verification" on storage.objects for select to authenticated
using(bucket_id='Mental health verification' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));


-- Provider-safe session queue with the managed patient's display name.
create or replace function public.get_my_mental_health_sessions()
returns table(
  id uuid,
  patient_id uuid,
  subject_id uuid,
  subject_name text,
  requested_start timestamptz,
  consultation_type text,
  concern_category text,
  patient_note text,
  status text
)
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='mental_health') then
    raise exception 'Mental-health professional account required';
  end if;
  return query
  select a.id,a.patient_id,a.subject_id,coalesce(s.full_name,'Patient'),a.requested_start,a.consultation_type,a.concern_category,a.patient_note,a.status
  from public.mental_health_appointments a
  join public.patient_subjects s on s.id=a.subject_id
  where a.provider_id=auth.uid()
  order by a.requested_start desc;
end;
$$;
revoke all on function public.get_my_mental_health_sessions() from public,anon;
grant execute on function public.get_my_mental_health_sessions() to authenticated;

commit;
