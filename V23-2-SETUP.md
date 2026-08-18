# MediBridge v23.2 — Referral Consultation & Prescribing

## Important workflow correction

The receiving specialist should not prescribe directly from the Referral page.

The safe clinical flow is:

Referral → Patient approval → Specialist accepts → Patient books specialist →
Specialist opens linked appointment → Consultation → Prescription → Appointment completed →
Referral automatically completed.

The linked appointment already has the full MediBridge consultation system:
- clinical notes
- assessment
- diagnosis
- investigations
- advice
- medicines/prescription
- report access
- shared files

## Fixes in v23.2

- Receiving doctor can no longer manually mark an Accepted referral as Completed.
- Accepted referral tells the specialist to wait for patient booking.
- Once Booked, receiving doctor gets `Open specialist appointment`.
- The specialist prescribes from that appointment.
- Completing the appointment automatically completes the referral.
- Adds recovery for v23/v23.1 test referrals that were incorrectly completed before booking.

## Setup

1. Run `v23-2-backend.sql`.
2. Deploy the unzipped v23.2 frontend.
3. Open your existing test referral.

Because the screenshot referral was already marked Completed without a booked appointment,
v23.2 will show `Continue referral — appointment required`.
Click it once to return it to Accepted.

Then:
Patient → referral → Book referred specialist → choose Doctor B slot.
Doctor B → referral → Open specialist appointment → consult/prescribe.
