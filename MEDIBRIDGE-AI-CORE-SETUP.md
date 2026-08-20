# MediBridge v32.0 — AI Core setup

MediBridge AI Core is a secure, replaceable AI gateway for the Patient AI and Doctor AI interfaces.

## Architecture

Browser UI → authenticated `/api/ai-chat` gateway → provider adapter → configured OpenAI-compatible model

The browser never receives the provider API key. General chat remains in browser memory and is not written to the MediBridge database. Existing record-specific AI modes continue through the consent-aware Supabase `medibridge-ai` function.

## Required Netlify environment variables

Add these in the Netlify site's environment-variable settings:

```text
GROQ_API_KEY=<your Groq key>
SUPABASE_URL=<your existing Supabase project URL>
SUPABASE_ANON_KEY=<your existing Supabase anon key>
```

Keep `MEDIBRIDGE_REQUIRE_AUTH` unset or set it to `true`. The gateway validates the user's Supabase session and checks that Doctor AI is used only by a verified doctor.

Do not put provider keys in GitHub, `ai-config.js`, `supabase-config.js`, or any browser file.

## Optional configuration

```text
GROQ_MODEL=openai/gpt-oss-120b
MEDIBRIDGE_AI_RATE_LIMIT=20
MEDIBRIDGE_REDACT_IDENTIFIERS=true
```

To switch to another OpenAI-compatible provider later:

```text
MEDIBRIDGE_AI_PROVIDER=<provider label>
MEDIBRIDGE_AI_BASE_URL=<chat-completions endpoint>
MEDIBRIDGE_AI_API_KEY=<private provider key>
MEDIBRIDGE_AI_MODEL=<model id>
```

The generic variables take priority over the Groq variables. Confirm the new provider's privacy, retention, regional-processing, healthcare, and commercial-use terms before sending any health information.

## Files to add or replace

- `index.html`
- `app-v31-1.js`
- `style-v31-1.css`
- `ai-config.js`
- `medibridge-ai-service.js`
- `server/ai-core.js`
- `netlify/functions/ai-chat.mjs`
- `netlify.toml`
- `package.json`

Delete the previous `netlify/functions/ai-chat.js` after adding `ai-chat.mjs`.

Keep the repository's existing `supabase-config.js`. It is intentionally not included in this package.

## Deploy and verify

1. Add the required environment variables.
2. Push the updated files to GitHub.
3. Trigger a new Netlify deploy.
4. Open `/api/ai-chat` in a browser. It should return a JSON health response with `status: "ready"` and must never return an API key.
5. Sign in as a patient and test Patient AI.
6. Sign in as a verified doctor and test Doctor AI.
7. Press **Stop** during generation to confirm that streaming can be cancelled.
8. Test an explicit emergency sentence using test data and confirm that emergency guidance appears before model generation.

## Safety and privacy boundaries

- AI supports understanding and clinical review; it is not the final diagnosis or treatment decision.
- General chat is not automatically added to a medical record.
- Obvious emails, Indian phone numbers, and 12-digit identifiers are removed before provider submission by default.
- Explicit emergency language receives deterministic emergency guidance without waiting for the model.
- Do not upload copyrighted medical books without permission.
- Use synthetic or de-identified information during prototype testing.

## Local validation

With Node.js 20 or later:

```text
npm test
npm run build
```

No new Supabase SQL migration is required for this AI Core upgrade.
