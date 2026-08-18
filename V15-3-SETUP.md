# MediBridge v15.3

No new SQL migration is required if v15.2 SQL was already run.

1. Replace ALL code in `medibridge-ai` with:
   `supabase/functions/medibridge-ai/index.ts`
2. Deploy the Edge Function.
3. Deploy the unzipped v15.3 frontend to Netlify.

Changes:
- Patient consultation explanation uses `thinkingLevel: "low"`.
- Doctor reference remains `medium`.
- Doctor patient review uses `high`.
- Output limit for patient consultation explanation is 4096 tokens.
- All 8 sections are explicitly required.
- Old v15.2 cached explanation is invalidated once.
- MAX_TOKENS output is not cached.
