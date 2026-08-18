// MediBridge AI provider adapter.
// UI code talks to this service, never directly to Puter.
// PUTER_AI_START
(function () {
  function config() {
    return window.MEDIBRIDGE_AI_CONFIG || {
      enabled: false,
      provider: "disabled"
    };
  }

  function isEnabled() {
    return Boolean(config().enabled);
  }

  function providerName() {
    return config().provider || "disabled";
  }

  function isSecureBackendMode(mode) {
    return (config().secureBackendModes || []).includes(mode);
  }

  async function chatWithAI({
    messages,
    model,
    stream,
    tools,
    webSearch = false,
    onToken,
    shouldStop
  }) {
    const cfg = config();

    if (!cfg.enabled) {
      throw new Error("MediBridge AI is currently disabled.");
    }

    if (cfg.provider !== "puter") {
      throw new Error("The configured MediBridge AI provider is not available.");
    }

    if (!window.MediBridgePuterAI) {
      throw new Error("MediBridge AI provider module did not load.");
    }

    const request = {
      messages,
      model: model || cfg.defaultModel,
      fallbackModels: cfg.fallbackModels || [],
      stream: stream ?? cfg.stream,
      tools: tools || [],
      onToken,
      shouldStop
    };

    if (webSearch) {
      if (!cfg.allowWebSearch) {
        throw new Error("Current-information search is disabled.");
      }
      return window.MediBridgePuterAI.searchWithAI(request);
    }

    return window.MediBridgePuterAI.sendAIMessage(request);
  }

  async function analyzeImage(options) {
    const cfg = config();
    if (!cfg.enabled || cfg.provider !== "puter" || !window.MediBridgePuterAI) {
      throw new Error("MediBridge AI image assistance is unavailable.");
    }

    return window.MediBridgePuterAI.analyzeImage({
      ...options,
      model: options?.model || cfg.defaultModel
    });
  }

  async function textToSpeech(text, options) {
    const cfg = config();
    if (!cfg.enabled || cfg.provider !== "puter" || !window.MediBridgePuterAI) {
      throw new Error("MediBridge AI read-aloud is unavailable.");
    }
    return window.MediBridgePuterAI.textToSpeech(text, options);
  }

  window.MediBridgeAI = {
    isEnabled,
    providerName,
    isSecureBackendMode,
    chatWithAI,
    analyzeImage,
    textToSpeech
  };
})();
// PUTER_AI_END
