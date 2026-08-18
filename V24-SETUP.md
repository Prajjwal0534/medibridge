# MediBridge v24 — Notifications Center

## What v24 adds

Persistent in-app notifications across MediBridge.

Users now get a Notifications tab with an unread badge.

Notifications are generated for:

Appointments
- booked
- confirmed
- completed
- no-show
- cancelled

Referrals
- created
- patient approved
- specialist accepted
- appointment booked
- no-show
- completed
- closed after no-show
- declined

Diagnostics
- new request for lab
- accepted
- sample/visit pending
- in process
- report ready
- completed/rejected/cancelled

Pharmacy
- new prescription request for pharmacy
- accepted
- preparing
- ready
- fulfilled/rejected/cancelled

## Navigation

Opening an appointment/referral notification takes the user directly to that record.
Diagnostics and pharmacy notifications open the corresponding workspace.

## Setup

1. Run `v24-backend.sql` in Supabase SQL Editor.
2. Deploy the unzipped v24 folder to Netlify.
3. Sign out/in or refresh.
4. Create/update a test appointment, referral, diagnostic request or pharmacy request.
5. The Notifications badge should appear.

No AI Edge Function changes.

## Note

v24 notifications are persistent in Supabase and the badge refreshes automatically about every 30 seconds.
A later production version can add push notifications/email/SMS separately.
