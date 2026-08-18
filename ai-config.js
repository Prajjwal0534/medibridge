// MediBridge AI central configuration
// PUTER_AI_START
window.MEDIBRIDGE_AI_CONFIG = Object.freeze({
  enabled: true,
  provider: "puter",

  // Puter model IDs use provider/model form.
  defaultModel: "openai/gpt-5.6-luna",
  fallbackModels: [
    "openai/gpt-5.6-terra",
    "openai/gpt-5.6-sol"
  ],

  stream: true,
  allowWebSearch: true,

  // Record-grounded modes remain on the existing secure MediBridge backend.
  secureBackendModes: [
    "patient_summary",
    "doctor_patient_review"
  ]
});
// PUTER_AI_END
