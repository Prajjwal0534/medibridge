-- MediBridge v21.1 — Pharmacy discovery/location fix
-- Run after v21-backend.sql.

-- The v21 frontend queried `profiles` directly to discover verified pharmacies.
-- Depending on existing profiles RLS, patients may not be able to see those rows.
-- This RPC returns only safe public pharmacy discovery fields.

create or replace function public.get_verified_pharmacies()
returns table (
  id uuid,
  pharmacy_name text,
  address text,
  city text,
  district text,
  state text,
  phone text,
  google_maps_url text,
  latitude double precision,
  longitude double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ph.id,
    ph.pharmacy_name,
    ph.address,
    ph.city,
    ph.district,
    ph.state,
    ph.phone,
    ph.google_maps_url,
    ph.latitude,
    ph.longitude
  from public.pharmacy_profiles ph
  join public.profiles p on p.id = ph.id
  where p.role = 'pharmacy'
    and p.verification_status = 'verified'
  order by ph.pharmacy_name asc;
$$;

revoke all on function public.get_verified_pharmacies() from public;
grant execute on function public.get_verified_pharmacies() to authenticated;
