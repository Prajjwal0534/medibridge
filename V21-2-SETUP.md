# MediBridge v21.2 — Location-gated healthcare discovery

This version implements the location rule:

MediBridge should NOT show the entire network by default.

A patient must first:
- enter a city/district, OR
- use current GPS location

Then matching healthcare options appear.

## Pharmacies

Before location:
- no pharmacies listed
- prescription pharmacy dropdown is hidden behind a location prompt

After city/district:
- only pharmacies in matching city/district appear
- distance is NOT required

After GPS:
- radius/distance filtering is used
- distance remains optional in the sense that users can simply use city/district instead

## Doctors / clinics

Doctors are now also location-gated.

Doctor onboarding gains:
- Clinic city
- Clinic district

Before a patient selects city/district/GPS:
- no doctor list is dumped

After location:
- only matching doctors/clinics are shown

Existing doctor accounts should fill Clinic city + Clinic district once in Profile.

## Hospitals / clinics

Hospital discovery was already location-gated and remains that way.

## Setup

1. Run `v21-2-backend.sql`.
2. No Edge Function change.
3. Deploy the unzipped v21.2 folder.
4. Existing doctor account → Profile → fill Clinic city + Clinic district → Save.
5. Test Patient → Pharmacy and Patient → Book Appointment.

Expected:
No global pharmacy/doctor/hospital dump before choosing location.
