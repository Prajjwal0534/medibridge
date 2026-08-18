-- MediBridge v9.3: accurate PostGIS radius + distance
-- Run once in Supabase SQL Editor before deploying v9.3.

create extension if not exists postgis with schema extensions;

-- Remove impossible legacy/test coordinates so they cannot corrupt distance search.
update public.hospital_profiles
set latitude = null,
    longitude = null
where
  (latitude is not null and (latitude < -90 or latitude > 90))
  or (longitude is not null and (longitude < -180 or longitude > 180))
  or ((latitude is null) <> (longitude is null));

alter table public.hospital_profiles
drop constraint if exists hospital_profiles_valid_coordinates;

alter table public.hospital_profiles
add constraint hospital_profiles_valid_coordinates
check (
  (latitude is null and longitude is null)
  or (
    latitude between -90 and 90
    and longitude between -180 and 180
  )
);

alter table public.hospital_profiles
add column if not exists location extensions.geography(POINT, 4326);

-- Convert existing valid latitude/longitude pairs to a real geographic point.
update public.hospital_profiles
set location =
  extensions.st_setsrid(
    extensions.st_makepoint(longitude::double precision, latitude::double precision),
    4326
  )::extensions.geography
where latitude is not null
  and longitude is not null;

create or replace function public.sync_hospital_location()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if new.latitude is null and new.longitude is null then
    new.location := null;
    return new;
  end if;

  if new.latitude is null or new.longitude is null then
    raise exception 'Latitude and longitude must both be provided';
  end if;

  if new.latitude < -90 or new.latitude > 90 then
    raise exception 'Latitude must be between -90 and 90';
  end if;

  if new.longitude < -180 or new.longitude > 180 then
    raise exception 'Longitude must be between -180 and 180';
  end if;

  new.location :=
    extensions.st_setsrid(
      extensions.st_makepoint(
        new.longitude::double precision,
        new.latitude::double precision
      ),
      4326
    )::extensions.geography;

  return new;
end;
$$;

drop trigger if exists sync_hospital_location_trigger
on public.hospital_profiles;

create trigger sync_hospital_location_trigger
before insert or update of latitude, longitude
on public.hospital_profiles
for each row
execute function public.sync_hospital_location();

create index if not exists hospital_profiles_location_gix
on public.hospital_profiles
using gist (location);


-- Exact nearby emergency search.
-- For geography, PostGIS measures in metres.
create or replace function public.nearby_emergency_hospitals(
  user_lat double precision,
  user_lng double precision,
  radius_km double precision,
  needed_capability text default null
)
returns table (
  id uuid,
  hospital_name text,
  address text,
  city text,
  district text,
  state text,
  google_maps_url text,
  latitude numeric,
  longitude numeric,
  emergency_status text,
  emergency_beds_available integer,
  icu_beds_available integer,
  status_note text,
  capabilities text[],
  distance_km double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with origin as (
    select
      extensions.st_setsrid(
        extensions.st_makepoint(user_lng, user_lat),
        4326
      )::extensions.geography as point
  )
  select
    h.id,
    h.hospital_name,
    h.address,
    h.city,
    h.district,
    h.state,
    h.google_maps_url,
    h.latitude,
    h.longitude,
    s.status as emergency_status,
    s.emergency_beds_available,
    s.icu_beds_available,
    s.status_note,
    coalesce(
      array_agg(distinct c.capability)
        filter (where c.capability is not null),
      '{}'::text[]
    ) as capabilities,
    extensions.st_distance(h.location, o.point) / 1000.0 as distance_km
  from public.hospital_profiles h
  cross join origin o
  join public.hospital_emergency_status s
    on s.hospital_id = h.id
  left join public.hospital_capabilities c
    on c.hospital_id = h.id
  where h.emergency_available = true
    and h.location is not null
    and s.status in ('accepting', 'limited', 'diverting')
    and extensions.st_dwithin(
      h.location,
      o.point,
      radius_km * 1000.0
    )
    and (
      needed_capability is null
      or needed_capability = ''
      or exists (
        select 1
        from public.hospital_capabilities hc
        where hc.hospital_id = h.id
          and hc.capability = needed_capability
      )
    )
  group by
    h.id,
    h.hospital_name,
    h.address,
    h.city,
    h.district,
    h.state,
    h.google_maps_url,
    h.latitude,
    h.longitude,
    h.location,
    s.status,
    s.emergency_beds_available,
    s.icu_beds_available,
    s.status_note,
    o.point
  order by extensions.st_distance(h.location, o.point);
$$;

grant execute on function public.nearby_emergency_hospitals(
  double precision,
  double precision,
  double precision,
  text
) to anon, authenticated;
