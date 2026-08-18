-- MediBridge v22.1 — Diagnostic test catalogue visibility fix
-- Run after v22-backend.sql.

-- Patient discovery of lab tests should not depend on direct profiles-table visibility.
-- This safe RPC returns only active catalogue entries for verified diagnostic centres.

create or replace function public.get_verified_lab_tests(
  target_lab_ids uuid[]
)
returns table (
  id uuid,
  lab_id uuid,
  test_name text,
  category text,
  sample_or_modality text,
  turnaround_time text,
  indicative_price numeric,
  is_active boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id,
    t.lab_id,
    t.test_name,
    t.category,
    t.sample_or_modality,
    t.turnaround_time,
    t.indicative_price,
    t.is_active
  from public.lab_tests t
  join public.profiles p on p.id = t.lab_id
  where t.lab_id = any(target_lab_ids)
    and t.is_active = true
    and p.role = 'lab'
    and p.verification_status = 'verified'
  order by t.test_name asc;
$$;

revoke all on function public.get_verified_lab_tests(uuid[]) from public;
grant execute on function public.get_verified_lab_tests(uuid[]) to authenticated;
