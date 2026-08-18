# MediBridge v15 — Doctor Record + Patient AI Explanation

## What v15 adds

Patients can open a completed consultation and see two views side by side:

1. Doctor Record
- diagnosis
- assessment
- clinical notes
- investigations
- prescription
- advice
- follow-up date

2. AI Explanation
- what the diagnosis means in simple language
- why each medicine may have been prescribed
- why tests may have been requested
- what the doctor's advice means
- when follow-up was recorded
- why follow-up may matter, only when supported by the record or clearly labeled as general context

The AI is instructed not to invent the doctor's intent.

## Step 1 — SQL

Run `v15-backend.sql` in Supabase SQL Editor.

## Step 2 — Edge Function

Replace the entire code of:

`medibridge-ai`

with:

`supabase/functions/medibridge-ai/index.ts`

Then deploy.

Your existing GEMINI_API_KEY remains unchanged.

## Step 3 — Frontend

Deploy the unzipped v15 folder to Netlify.

## Test

1. Log in as a patient with a completed consultation.
2. Open Medical Record.
3. Tap `Doctor + AI explanation`.
4. Confirm the left card shows the doctor's original record.
5. Tap `Explain in simple words`.
6. Confirm the right card explains the consultation without changing the doctor's text.

No new storage bucket is required.
