# MediBridge v23.5 — Doctor-side close after no-show

## New behavior

If the linked specialist appointment is marked `no_show`:

Referral → `Appointment missed — rebook`

At that point:
- Patient can `Rebook specialist`
- Receiving doctor can `End referral after no-show`

If the doctor ends it:
Referral → `Closed after no-show`

The patient can no longer rebook through that referral and would need a new referral pathway.

This is different from `Completed`.
Completed is reserved for an actual completed specialist consultation.

## Setup

1. Run `v23-5-backend.sql`.
2. Deploy the unzipped v23.5 frontend.
3. Open a referral in `Appointment missed — rebook` as the receiving doctor.
4. You should see `End referral after no-show`.

No AI changes.
