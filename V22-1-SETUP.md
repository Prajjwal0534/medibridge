# MediBridge v22.1 — Diagnostic catalogue visibility fix

## Why the patient could see the lab but not its tests

The lab itself was correctly visible through `get_verified_labs()`.

But the patient-side catalogue was still querying `lab_tests` directly.
The `lab_tests` RLS verification rule checks the `profiles` table, and your existing profiles RLS can prevent that verification check from succeeding for another account.

Result:
- Lab visible ✅
- CBC exists on lab side ✅
- Patient sees "This centre has not added its test catalogue yet." ❌

## Fix

v22.1 adds:
`get_verified_lab_tests(uuid[])`

This SECURITY DEFINER RPC returns only:
- active tests
- belonging to verified diagnostic-centre accounts

The patient UI now uses that RPC instead of reading `lab_tests` directly.

## Setup

1. Run `v22-1-backend.sql`.
2. Deploy the unzipped v22.1 folder.
3. Refresh/sign in again if cached.
4. Patient → Diagnostics → choose the same location.

The CBC test already added by the lab should now appear.
