# MediBridge v13 AI setup

MediBridge v13 introduces a Supabase Edge Function named `medibridge-ai`.

## 1. Run database migration
Run `v13-backend.sql` in the Supabase SQL Editor.

It creates only an AI request metadata log. Prompts and AI answers are not stored there.

## 2. Add your OpenAI API key as a Supabase secret
Never place this key in `app-v13.js`, Netlify frontend environment variables exposed to the browser, or HTML.

In Supabase:
- Open your project.
- Go to Edge Functions / Secrets.
- Add:
  - `OPENAI_API_KEY` = your OpenAI API key
  - optional `OPENAI_MODEL` = `gpt-5-mini`

## 3. Deploy Edge Function

### Supabase Dashboard route
If your Supabase dashboard supports creating/deploying Edge Functions:
- Create a function named `medibridge-ai`.
- Copy the contents of `supabase/functions/medibridge-ai/index.ts`.
- Deploy it with JWT verification enabled.

### CLI route
From the project folder:

```bash
supabase login
supabase link --project-ref fllsbalijfyoniqnqlnj
supabase functions deploy medibridge-ai
```

Set secrets if not already done in the dashboard:

```bash
supabase secrets set OPENAI_API_KEY=YOUR_KEY
supabase secrets set OPENAI_MODEL=gpt-5-mini
```

Do not commit `.env` files or API keys.

## 4. Deploy frontend
Deploy the unzipped v13 folder to Netlify.

## Patient modes
- Explain simply
- Prepare questions
- Summarize my record

## Doctor modes
- Clinical reference (no patient record required)
- Review consented patient (active consent required)

The Edge Function authenticates the Supabase user, checks their role, and loads patient context using that user's JWT so Row Level Security remains in force.
