-- Run once in Supabase SQL Editor before testing new signups.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text;
begin
  requested_role := coalesce(new.raw_user_meta_data->>'role', 'patient');

  if requested_role not in ('patient', 'doctor', 'hospital') then
    requested_role := 'patient';
  end if;

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    requested_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.protect_profile_security_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.id then
    if new.role is distinct from old.role then
      raise exception 'Users cannot change their own account role';
    end if;

    if new.verification_status is distinct from old.verification_status then
      raise exception 'Users cannot change their own verification status';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_security_fields on public.profiles;

create trigger protect_profile_security_fields
before update on public.profiles
for each row
execute function public.protect_profile_security_fields();
