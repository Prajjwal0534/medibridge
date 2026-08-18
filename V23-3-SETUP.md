# MediBridge v23.3 — Referral Booking Sync Fix

## Bug fixed

In v23.2:
- patient booked the referred specialist successfully
- the appointment was created
- but the referral could remain `Accepted / Ready to book`

Cause:
the secure linking RPC enabled the booking override, but the referral update trigger still rejected the internal `Accepted → Booked` status transition.

The frontend then accidentally replaced the linking error message with `Appointment booked successfully`, making the failure easy to miss.

## v23.3

Future referral bookings now correctly become:
Accepted → Booked

When the linked specialist appointment is completed:
Booked → Completed automatically.

## Fix your existing test referral

Your current referral already has a specialist appointment, so after installing v23.3:

1. Open the same referral as Doctor B or the patient.
2. Tap `Sync appointment status`.
3. MediBridge finds the matching appointment.
4. Because your specialist appointment is already Completed, the referral should move directly to Completed.

## Setup

1. Run `v23-3-backend.sql`.
2. Deploy the unzipped v23.3 frontend.
3. Open the existing referral and tap `Sync appointment status`.

No AI Edge Function changes.
