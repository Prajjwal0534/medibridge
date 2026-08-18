# MediBridge v14.2 — AI UI Refinement

No SQL changes are required.

No Edge Function changes are required if your current `medibridge-ai` is already returning grounded sources correctly.

Deploy the unzipped v14.2 folder to Netlify.

Changes:
- version marker updated to v14.2
- grounded responses show `Grounded reference`
- AI markdown headings/bold/bullets render cleanly
- [S1], [S2], etc. are rendered as source chips
- source cards are cleaner and show retrieval method when available
- source links remain clickable
- the renderer escapes HTML before formatting AI text

Test:
Doctor AI → ask the same hypertension question with approved sources enabled.

Expected:
- `Grounded reference` badge
- formatted headings instead of literal ### / **
- visible S1 chips
- WHO source displayed cleanly under Clinical sources used
