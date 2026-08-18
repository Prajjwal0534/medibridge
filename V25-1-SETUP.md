# MediBridge v25.1 — Care Timeline navigation fix

## What was wrong in v25

The Care Timeline page existed in the frontend, but two navigation hooks were missing:

1. `timelineNavBtn` was not included in the signed-in UI visibility logic.
2. `showPage('timeline')` did not call `loadCareTimeline()`.

That is why a patient could not see/open the new Care Timeline tab.

## v25.1 fix

For patient accounts:
- `Care Timeline` is visible in the top navigation.
- Clicking it opens the Care Timeline page.
- The timeline data loads automatically.

For non-patient accounts:
- Care Timeline remains hidden.

## Setup

No SQL changes.

Just deploy the unzipped v25.1 frontend to Netlify and refresh/sign in.

Expected patient navigation includes:

Medical Record → Care Timeline → Follow-ups → Reports → Pharmacy → Diagnostics → Consent & Access → Referrals → Notifications
