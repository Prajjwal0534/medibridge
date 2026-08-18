# MediBridge v23.9 — Consulted → Completed referral timeline

Frontend-only refinement.

## Successful attended pathway

When the referred specialist appointment is completed, the referral timeline now shows:

Referral → Approved → Accepted → Booked → Consulted → Completed

This makes it clear that the patient actually attended and received specialist care before the referral was closed.

## No-show pathway remains

Referral → Approved → Accepted → Booked → No-show

Then either:
- Patient rebooks
- Receiving doctor closes it

Closed no-show:
Referral → Approved → Accepted → Booked → No-show → Closed

## Setup

No SQL changes.

Deploy the unzipped v23.9 frontend and refresh.
