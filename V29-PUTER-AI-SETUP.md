# MediBridge v29 — Modular Puter.js AI

## What I inspected

MediBridge is currently a vanilla/static HTML + JavaScript application, not React/Vite.

Current frontend:
- `index.html`
- versioned `app-vXX.js`
- versioned `style-vXX.css`
- `supabase-config.js`

Backend:
- Supabase Auth / database / storage / Edge Functions

Deployment:
- GitHub repository → Netlify automatic deployment

Existing AI:
- Patient AI page
- Doctor AI page
- consent-aware patient review
- approved clinical-knowledge RAG
- consultation explanation/follow-up AI
- doctor pre-completion AI review
- Supabase Edge Function: `medibridge-ai`

Because this is a static browser application, v29 uses the Puter CDN rather than adding npm/Vite.

## New files

- `ai-config.js`
- `puter-ai.js`
- `medibridge-ai-service.js`

Architecture:

MediBridge UI
→ `MediBridgeAI` service
→ Puter provider
→ `puter.ai.chat()`

Only `puter-ai.js` directly calls Puter.

## Existing files changed

- `index.html`
- `app-v29.js`
- `style-v29.css`

No Supabase SQL changes.

## Which AI requests use Puter

Puter:
- patient general explanation chat
- patient question preparation
- doctor general clinical-reference chat
- optional web search when the user explicitly checks it

Existing secure Supabase backend remains for:
- patient record summary
- doctor review of a consented patient
- existing consultation explanation/follow-up workflows
- existing doctor pre-completion review
- approved clinical-knowledge RAG

This prevents v29 from silently sending stored patient records to a new third-party provider.

## Chat behavior

- multi-turn conversation in browser memory only
- streaming response
- Enter sends; Shift+Enter adds a newline
- user + MediBridge AI chat bubbles
- Clear/New chat
- Stop Generation stops rendering/consuming after the current chunk
- no Puter chat messages are written to Supabase by this integration
- web search is off by default

## Model config

`ai-config.js`:

- default: `openai/gpt-5.6-sol`
- fallback: `openai/gpt-5.6-terra`
- fallback: `openai/gpt-5.6-luna`

Patients see “MediBridge AI”, not the provider name as the assistant identity.

## GitHub deployment

Upload/replace:

- `index.html`
- `app-v29.js`
- `style-v29.css`

Add:

- `ai-config.js`
- `puter-ai.js`
- `medibridge-ai-service.js`
- `V29-PUTER-AI-SETUP.md` (optional documentation)

Commit changes. Netlify should deploy automatically.

No Supabase SQL needs to be run.

## Test after Netlify deploy

1. Confirm the header says `v29`.
2. Sign in as Patient.
3. Open AI Assistant.
4. Ask: `What does blood pressure mean in simple words?`
5. Confirm:
   - your bubble appears immediately
   - MediBridge AI streams a reply
   - another question remembers the current conversation
6. Click New chat and confirm context clears.
7. Sign in as verified Doctor.
8. Open AI Assistant → Clinical reference.
9. Ask a general medical-reference question.
10. Test `Search current information` only when needed.
11. Confirm `Summarize my record` / `Review consented patient` still use the existing secure backend.

## Disable Puter without deleting it

In `ai-config.js`:

```js
enabled: false
```

The AI page fails gracefully; unrelated MediBridge features continue to work.

## Completely remove Puter later

1. Set AI disabled first.
2. Remove these script tags from `index.html`:
   - `https://js.puter.com/v2/`
   - `ai-config.js`
   - `puter-ai.js`
   - `medibridge-ai-service.js`
3. Delete:
   - `ai-config.js`
   - `puter-ai.js`
   - `medibridge-ai-service.js`
4. Replace the central `MediBridgeAI` adapter with your future provider.
5. No patient profile, appointment, Supabase schema, routing or other business logic needs to be rebuilt.

Search for `PUTER_AI_START` / `PUTER_AI_END` to find the integration boundaries.
