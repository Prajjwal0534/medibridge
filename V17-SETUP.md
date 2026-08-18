# MediBridge v17 — Doctor AI Pre-completion Review

## Step 1
Run `v17-backend.sql` in Supabase SQL Editor.

## Step 2
Replace ALL code in `medibridge-ai` with:
`supabase/functions/medibridge-ai/index.ts`

Deploy the function.

## Step 3
Deploy the unzipped v17 folder to Netlify.

## Test
Doctor → My Appointments → open an active booked/confirmed appointment.

Type consultation notes, assessment, diagnosis and prescription.

Before `Save & complete appointment`, press:

`Review current draft`

MediBridge reviews the unsaved draft plus a limited patient safety context:
- allergies
- current medications
- conditions
- recent vitals

The AI does not write anything back automatically. The doctor chooses whether to change anything.
