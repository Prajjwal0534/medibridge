# MediBridge v23.4 — No-show referral handling

A no-show is not a completed consultation.

Correct flow:
Booked referral appointment → No-show → Referral stays active as `Appointment missed — rebook`.

Patient can then tap `Rebook specialist`.

Only a specialist appointment marked `Completed` closes the referral.

## Setup
1. Run `v23-4-backend.sql`.
2. Deploy the unzipped v23.4 frontend.
3. Open your current referral and tap Sync appointment status once.

Because the linked appointment in your screenshot is already `no_show`,
the referral should become `Appointment missed — rebook`.

No AI changes.
