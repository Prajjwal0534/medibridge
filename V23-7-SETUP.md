# MediBridge v23.7

Fixes the exact bug where:
- linked specialist appointment = `no_show`
- referral still = `booked`

After v23.7:
- Mark no-show immediately syncs the referral.
- Opening a stuck booked referral self-heals it.
- Doctor can also press `Sync appointment status` as a fallback.

Once the referral becomes `appointment_missed`, the existing v23.5 action appears:
`End referral after no-show`.

## Setup
1. Run `v23-7-backend.sql`.
2. Deploy v23.7.
3. Reopen the current referral.

It should change to `Appointment missed — rebook`, and Doctor B should see
`End referral after no-show`.
