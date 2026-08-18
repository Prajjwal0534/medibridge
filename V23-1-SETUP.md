# MediBridge v23.1 — Referral Specialist Discovery Gate

## Change

The specialist list no longer appears globally.

A doctor must first choose:
1. Specialty
2. City or district

Only then does the `Refer to specialist` dropdown become active.

The dropdown then shows only verified doctors whose:
- specialty matches the selected specialty, and
- clinic city or clinic district matches the entered location.

This prevents a future statewide doctor list from becoming messy.

## Setup

No SQL changes are required.

Deploy the unzipped v23.1 frontend and refresh the site.

## Test

Doctor appointment → Refer to another doctor

Before entering specialty/location:
`Refer to specialist` should be disabled.

After choosing both:
only matching verified specialists should appear.
