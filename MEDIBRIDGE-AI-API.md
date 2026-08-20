# MediBridge AI Gateway API v1

## Health

`GET /api/ai-chat`

Returns the provider label, model id, authentication mode, streaming support, and one of these states:

- `ready`
- `configuration_required`
- `unavailable`

Secrets are never returned.

## Chat

`POST /api/ai-chat`

The browser sends the current Supabase access token in the `Authorization: Bearer ...` header.

Example request:

```json
{
  "apiVersion": "v1",
  "assistantType": "patient",
  "mode": "patient_explain",
  "stream": true,
  "messages": [
    { "role": "user", "content": "Explain high blood pressure simply." }
  ]
}
```

Supported prototype modes:

- Patient: `patient_explain`, `patient_questions`
- Verified doctor: `doctor_reference`

Consent-controlled `patient_summary` and `doctor_patient_review` requests continue to use the existing Supabase AI function; they are not accepted by this general gateway.

## Streaming response

The gateway returns newline-delimited JSON (`application/x-ndjson`):

```json
{"type":"meta","requestId":"...","provider":"groq","model":"openai/gpt-oss-120b","urgent":false}
{"type":"delta","text":"High blood pressure..."}
{"type":"done","requestId":"..."}
```

Possible event types:

- `meta`: provider-neutral response metadata and safety state
- `delta`: the next visible text fragment
- `done`: stream completion
- `error`: a safe client-facing streaming error

If `stream` is `false`, the endpoint returns one JSON object containing `text`, `provider`, `model`, `urgent`, and `requestId`.

## Security controls

- Supabase session validation
- Patient/doctor role enforcement
- Verified-doctor enforcement
- Server-side provider key
- Request-size and conversation limits
- Per-instance prototype rate limiting
- Identifier redaction
- No prompt or patient-content logging
- Deterministic emergency escalation

The rate limiter is intentionally lightweight for the prototype. Before large-scale production, replace it with a shared rate-limit store and add organization-level usage budgets, audit events, abuse monitoring, and clinical evaluation gates.
