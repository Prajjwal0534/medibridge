# MediBridge v14 setup

## 1. Run database migration
Run `v14-backend.sql` in Supabase SQL Editor.

This enables pgvector and creates:
- `clinical_knowledge_chunks`
- `match_clinical_knowledge(...)`

## 2. Deploy/replace `medibridge-ai`
Replace your current `medibridge-ai` Edge Function code with:

`supabase/functions/medibridge-ai/index.ts`

Deploy it.

This keeps Gemini as the generation model and adds:
- Gemini embeddings using `gemini-embedding-001`
- vector retrieval from approved clinical knowledge
- [S1], [S2], etc. source citations
- returned source metadata for the frontend

## 3. Create a second Edge Function
Create:

`clinical-knowledge-ingest`

Paste:

`supabase/functions/clinical-knowledge-ingest/index.ts`

Deploy it.

It requires:
- authenticated verified admin
- existing `GEMINI_API_KEY` Supabase secret

## 4. Deploy frontend
Deploy the unzipped v14 folder to Netlify.

## 5. Add approved content
Sign in as admin:
Clinical Knowledge → Add source passage.

For prototype testing, add only content you have permission to store, such as:
- your own summaries
- open-license material
- public-domain material
- short passages from sources you are authorized to use

Do not upload copyrighted textbooks or commercial clinical references unless you have the necessary license.

## How Doctor AI works
When "Use approved MediBridge medical sources" is enabled:
1. doctor's question is embedded
2. Supabase pgvector retrieves up to 5 similar approved passages
3. those passages are sent to Gemini as CLINICAL KNOWLEDGE
4. Gemini is instructed to cite them as [S1], [S2], etc.
5. the UI displays the returned source links/titles

Web search is intentionally NOT used as the default clinical knowledge source in v14.
