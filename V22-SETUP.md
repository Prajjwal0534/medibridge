# MediBridge v22 — Diagnostics / Lab Network

## What v22 adds

New account role:
- Diagnostic Centre / Lab

Lab onboarding:
- centre name
- registration/licence number
- address
- city
- district
- state
- phone
- Maps link
- optional GPS

Admin:
- pending diagnostic-centre verification
- approve/reject

Verified diagnostic centre:
- builds a test catalogue
- test name
- category
- sample/modality
- turnaround time
- optional indicative price
- receives patient requests
- workflow:
  Requested → Accepted → Sample/Visit Pending → In Process → Report Ready → Completed

Patient:
- Diagnostics tab
- location-gated discovery
- city/district or GPS
- radius only when GPS is used
- sees only diagnostic centres in selected area
- selects one or more tests
- chooses preferred date/time
- sends request
- tracks status
- can cancel while still only Requested

## Important boundary

v22 creates the diagnostic booking/workflow layer.

It does NOT yet upload the final lab report automatically into the patient's Reports Hub.
That should be the next refinement so a diagnostic centre can publish a completed report directly into the patient's medical record.

## Setup

1. Run `v22-backend.sql`.
2. No AI Edge Function changes.
3. Deploy the unzipped v22 folder.
4. Create a new `Diagnostic Centre / Lab` account.
5. Fill Profile.
6. Admin approves the lab.
7. Lab → Diagnostics → add tests.
8. Patient → Diagnostics → choose city/district → select centre/tests → send request.
9. Lab → Diagnostics → progress the request.
