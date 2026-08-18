# MediBridge v20.1.1 — SQL constraint fix

The previous v20.1 SQL tried to add the NEW status constraint before converting old v20 rows such as `open` and `waiting`.

That caused:
`ERROR 23514: check constraint ... is violated by some row`

v20.1.1 fixes the order:

1. Drop old status constraint.
2. Convert old statuses:
   - `open` -> `ended`
   - `waiting` -> `idle`
3. Add the new v20.1 status constraint.
4. Install the Realtime/RPC call workflow.

## What to do

Run `v20-1-1-backend.sql` in Supabase SQL Editor.

It is safe to run after the failed v20.1 attempt.

Then deploy the v20.1.1 folder to Netlify.
No AI Edge Function change.
