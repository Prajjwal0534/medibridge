// MediBridge AI client configuration.
// Provider/model/API key are intentionally NOT exposed to the browser.
window.MEDIBRIDGE_AI_CONFIG = Object.freeze({
  enabled: true,
  provider: "backend",
  endpoint: "/api/ai-chat",
  apiVersion: "v1",
  streaming: true,
  requestTimeoutMs: 60000,
  maxConversationMessages: 16,
  maxMessageCharacters: 6000,

  // Existing consent-aware modes remain on the current secure Supabase AI backend.
  secureBackendModes: [
    "patient_summary",
    "doctor_patient_review"
  ]
});
