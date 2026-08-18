# MediBridge v15.2 — Stable Patient Explanation

This patch fixes two things:
1. incomplete/cut-off patient explanations
2. repeated/different explanations when the patient asks again or reopens the consultation

## Step 1 — SQL
Run `v15-2-backend.sql`.

This creates a patient-owned cache table for completed-consultation AI explanations.

## Step 2 — Edge Function
Replace ALL code in `medibridge-ai` with:
`supabase/functions/medibridge-ai/index.ts`

Deploy it.

## Step 3 — Frontend
Deploy the unzipped v15.2 folder to Netlify.

## New behavior
- The first request generates the full 8-section explanation and saves it.
- Reopening the same unchanged consultation returns the saved explanation quickly.
- If the doctor later changes the consultation record, the record fingerprint changes and MediBridge automatically generates a fresh explanation.
- A frontend request lock prevents accidental duplicate calls from rapid taps.

No changes are required to `clinical-knowledge-ingest`.
