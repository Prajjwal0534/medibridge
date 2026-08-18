# MediBridge v14.1 — Hybrid Retrieval Fix

1. Run `v14-1-backend.sql` in Supabase SQL Editor.
2. Open Supabase → Edge Functions → `medibridge-ai` → Code.
3. Replace all current code with `supabase/functions/medibridge-ai/index.ts`.
4. Deploy the function.
5. Test the hypertension question again.
6. Optional: deploy the v14.1 frontend to Netlify for the `v14.1` marker and `Grounded reference` badge.

Expected:
- `[S1]` appears in the AI response.
- `WHO Hypertension Fact Sheet` appears under `Clinical sources used`.
