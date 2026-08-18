# MediBridge v16 — Consultation Follow-up Assistant

## Setup

1. Run `v16-backend.sql` in Supabase SQL Editor.
2. Replace ALL code in `medibridge-ai` with:
   `supabase/functions/medibridge-ai/index.ts`
   and deploy it.
3. Deploy the unzipped v16 folder to Netlify.

## Test
Patient → Medical Record → Doctor + AI explanation

Under the saved explanation, ask:
`Why did my doctor prescribe pantoprazole?`

The question and answer should persist after refresh/reopening.
The AI remains scoped to that completed consultation and recent questions in the same thread.
