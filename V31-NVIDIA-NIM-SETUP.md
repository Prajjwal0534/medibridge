# MediBridge v31 — NVIDIA NIM Provider Replacement

## Current structure inspected

MediBridge is a static HTML/JavaScript application, not React/Vite.

It currently uses:
- Supabase for authentication/database/storage/Edge Functions
- GitHub for source
- Netlify for deployment
- a centralized MediBridge AI service abstraction

Puter was present in:
- `index.html` through `https://js.puter.com/v2/`
- `puter-ai.js`
- `ai-config.js`
- `medibridge-ai-service.js`
- general Patient/Doctor AI flow in the main app

## v31 architecture

MediBridge UI
→ `medibridge-ai-service.js`
→ `/.netlify/functions/ai-chat`
→ NVIDIA NIM API
→ NVIDIA model

## Server-side model

Default:
`nvidia/nemotron-3.5-lightning-30b-a3b`

Optional override:
`NVIDIA_MODEL`

The model configuration lives in:
`netlify/functions/ai-chat.js`

## Required Netlify secret

Add:
`NVIDIA_API_KEY`

Do not place the value in GitHub or frontend code.

Optional:
`NVIDIA_MODEL=nvidia/nemotron-3.5-lightning-30b-a3b`

## Files to upload/replace in GitHub

Replace:
- `index.html`
- `app-v31.js`
- `style-v31.css`
- `ai-config.js`
- `medibridge-ai-service.js`

Add:
- `netlify/functions/ai-chat.js`

Optional:
- `V31-NVIDIA-NIM-SETUP.md`

Delete after v31 is confirmed working:
- `puter-ai.js`

There is no npm Puter package in this static project, so no npm uninstall is needed.

## Supabase

No Supabase SQL migration is required for v31.

Existing secure record-specific modes remain on the current consent-aware Supabase AI backend:
- Patient record summary
- Doctor consented-patient review

General Patient AI and Doctor clinical-reference AI now use the secure Netlify → NVIDIA path.

## Response mode

v31 uses stable non-streaming completion first.

The UI immediately shows the user's message and a thinking/loading state, then renders the response.

Streaming can be added later without changing the provider architecture.

## Test

Patient:
- sign in
- open AI Assistant
- ask `Explain high blood pressure in simple words.`
- ask a follow-up question to confirm conversation context

Doctor:
- sign in as verified doctor
- open Doctor AI → Clinical reference
- ask a general clinical-reference question

Security:
- browser should call `/.netlify/functions/ai-chat`
- browser source must not contain the NVIDIA key
- no browser call should go directly to `integrate.api.nvidia.com`

## Rollback

Restore the previous frontend files and previous Puter provider files/scripts, then redeploy Netlify.

No database rollback is needed because v31 does not change Supabase schema.

## Future provider swap

Later, keep the MediBridge UI and frontend service.
Replace only the backend implementation behind `/.netlify/functions/ai-chat` to use OpenAI, Anthropic, Gemini, self-hosted inference, or another provider.
