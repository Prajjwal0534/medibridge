# MediBridge v23.8 — Closed no-show timeline

Frontend-only UI improvement.

## What changed

`appointment_missed` now shows:
Referral → Approved → Accepted → Booked → No-show

`closed_no_show` now shows:
Referral → Approved → Accepted → Booked → No-show → Closed

This replaces the old single terminal badge-only display and makes the full referral history visible at a glance.

## Setup

No SQL changes.

Just deploy the unzipped v23.8 frontend and refresh.
