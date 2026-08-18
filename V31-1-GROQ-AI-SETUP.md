# MediBridge v31.1 — Groq Free-Tier AI

## Architecture

MediBridge Patient/Doctor UI
→ `medibridge-ai-service.js`
→ `/.netlify/functions/ai-chat`
→ Groq OpenAI-compatible API
→ configured model

## Default model

`openai/gpt-oss-120b`

The model is configured only in the Netlify function.

Optional Netlify override:
`GROQ_MODEL`

## Required Netlify environment variable

Add:
`GROQ_API_KEY`

Paste your Groq API key as its value.

Do not put the key in GitHub or any browser/frontend file.

After adding or changing the variable, trigger a new Netlify deploy.

## GitHub files

Replace/upload:
- `index.html`
- `app-v31-1.js`
- `style-v31-1.css`
- `ai-config.js`
- `medibridge-ai-service.js`
- `netlify/functions/ai-chat.js`

Optional:
- `V31-1-GROQ-AI-SETUP.md`

## Supabase

No SQL migration is required.

Supabase authentication, database, storage, appointments, care plans, reports, consent, and unrelated functionality are unchanged.

Existing sensitive record-specific AI modes remain on the existing consent-aware Supabase backend.

## Test

Patient:
1. Sign in.
2. Open AI Assistant.
3. Ask: `Explain high blood pressure in simple words.`
4. Ask a follow-up question.

Doctor:
1. Sign in as a verified doctor.
2. Open Doctor AI → Clinical reference.
3. Ask a general clinical-reference question.

The browser should call:
`/.netlify/functions/ai-chat`

It should not call Groq directly.

## Free-tier limits

The Groq free plan has request and token limits.
When a limit is reached, MediBridge shows a retry message.

## Rollback

Restore the previous v31 files and redeploy.
No database rollback is required.
