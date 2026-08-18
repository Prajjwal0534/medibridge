# MediBridge v21.1 — Pharmacy discovery + location fix

## Why the verified pharmacy was not appearing

v21 discovered pharmacies by querying `profiles` directly.
Your existing profiles RLS can prevent patients from reading other account rows, so the verified pharmacy could exist and still appear as "No verified pharmacies".

v21.1 fixes this with a safe SECURITY DEFINER RPC:
`get_verified_pharmacies()`

It returns only public pharmacy discovery fields.

## New patient pharmacy discovery

Patient → Pharmacy now has:
- verified pharmacy list
- city/district search
- Use my current location
- radius 5/10/25/50/100 km
- distance sorting where the pharmacy has GPS coordinates
- address, phone and Maps button

## GPS improvements for pharmacy account

The pharmacy profile now:
- explains blocked location permission
- has Retry GPS
- shows editable Latitude / Longitude fields
- keeps Google Maps link as fallback

## Setup

1. Run `v21-1-backend.sql` in Supabase SQL Editor.
2. No Edge Function changes.
3. Deploy the unzipped v21.1 folder to Netlify.
4. Sign out/in once if the old page is cached.

Test:
Patient → Pharmacy

The already verified pharmacy should now appear even without GPS.
If both patient and pharmacy have GPS coordinates, distance/radius filtering will work.
