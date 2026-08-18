# MediBridge v23 — Specialist Referral & Care Pathway

## What v23 adds

Doctor referral creation is now more structured:
- specialty needed
- optional city/district filter
- verified specialist selection
- urgency: Routine / Priority / Urgent
- reason
- clinical referral note

Patient referral pathway:
1. Referral proposed
2. Patient approves and chooses which completed consultation records to share
3. Receiving specialist accepts/declines
4. If accepted, patient gets `Book referred specialist`
5. Existing doctor availability/slot flow opens directly for that specialist
6. Booked appointment is linked to the referral
7. When that appointment is completed, the referral pathway closes automatically

Referral screens now show:
- specialty
- urgency
- receiving doctor
- care location
- progress timeline
- linked appointment

## Setup

1. Run `v23-backend.sql` in Supabase SQL Editor.
2. No AI Edge Function change.
3. Deploy the unzipped v23 folder.
4. Existing doctors should already have Clinic city/district from v21.2.

## Test

Doctor:
Open an active patient appointment → create referral → choose specialty/specialist.

Patient:
Referrals → open referral → select records → Approve.

Receiving doctor:
Referrals → open → Accept referral.

Patient:
Referrals → open → Book referred specialist → select available slot.

After the linked specialist appointment is completed, the referral status becomes Completed automatically.
