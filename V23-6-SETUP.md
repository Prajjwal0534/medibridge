# MediBridge v23.6 — Urgent Referral Auto-Scheduling

## New urgent pathway

Routine / Priority referrals:
Referral → patient approval → specialist accepts → patient books a slot.

Urgent referrals:
Referral → patient approval → specialist accepts →
MediBridge automatically reserves the earliest free 20-minute specialist slot within the next 2 hours.

The patient does NOT manually choose a slot.

## Important design

There is still an appointment record internally.
This is necessary for:
- doctor schedule
- clinical notes
- prescription
- reports/files
- audit trail
- no-show handling
- completion tracking

So the patient experiences "no appointment booking step", while MediBridge still has a safe clinical encounter record.

## Prototype behavior

- Earliest search starts about 10 minutes from acceptance.
- Searches every 5 minutes.
- Requires a 20-minute non-overlapping gap.
- Search window: next 2 hours.
- Urgent consultation type currently defaults to Online for speed.
- If there is no gap, referral stays Accepted and shows urgent manual coordination required.
- MediBridge does NOT overbook another confirmed/booked patient.

## Setup

If you already ran the v23.5 complete SQL:
1. Run `v23-6-backend.sql`.
2. Deploy v23.6 frontend.

If you want one combined migration from the v23.3-era state:
1. Run `v23-6-complete-backend.sql`.
2. Deploy v23.6 frontend.

## Test

Create referral:
- Specialty + location
- Urgency = Urgent

Patient:
- Approve referral/share records.

Receiving specialist:
- Accept referral.

Expected:
- If a free gap exists, referral immediately becomes `Appointment booked`.
- Doctor sees `Open specialist appointment`.
- Patient never selects a slot manually.
- The appointment should appear in My Appointments around the next 10–120 minutes.
