# MediBridge v21 — Pharmacy Network

## What v21 adds

Patient:
- sees doctor-recorded prescriptions
- chooses a verified participating pharmacy
- sends the prescription without re-uploading it
- tracks status
- can cancel while still only `requested`

Pharmacy:
- new Pharmacy / Medical Store account role
- pharmacy onboarding profile
- pending verification
- incoming prescription request inbox
- prescription items copied securely from the doctor consultation
- workflow:
  Requested → Accepted → Preparing → Ready → Fulfilled
- pharmacy can reject a request

Admin:
- pending pharmacy verification section
- approve/reject pharmacy accounts

## Important prototype boundaries

v21 does NOT:
- sell medicines online
- take payments
- calculate medicine prices
- promise stock availability
- provide delivery
- let pharmacy edit the doctor's prescription

Those should be separate later modules.

## Setup

1. Run `v21-backend.sql` in Supabase SQL Editor.
2. No AI Edge Function changes.
3. Deploy the unzipped v21 folder to Netlify.
4. Create a new Pharmacy / Medical Store account.
5. Complete its pharmacy profile.
6. Log in as admin and approve the pharmacy.
7. Log in as a patient who already has a doctor-recorded prescription.
8. Patient → Pharmacy → choose pharmacy → Send prescription.
9. Pharmacy → Pharmacy → Accept → Start preparing → Mark ready → Mark fulfilled.

## First test

Use the existing completed consultation that already contains prescription items.
