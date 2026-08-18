// MediBridge AI service abstraction.
// UI code calls this service, never NVIDIA directly.
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

  function trimConversation(messages) {
    const cfg = config();
    const maxMessages = Math.max(4, Number(cfg.maxConversationMessages || 12));
    const maxChars = Math.max(1000, Number(cfg.maxMessageCharacters || 6000));

    return (Array.isArray(messages) ? messages : [])
      .filter(m => m && ["user", "assistant"].includes(m.role))
      .slice(-maxMessages)
      .map(m => ({
        role: m.role,
        content: String(m.content || "").slice(-maxChars)
      }));
  }

  async function chatWithAI({ messages, assistantType = "patient" }) {
    const cfg = config();

    if (!cfg.enabled) {
      throw new Error("MediBridge AI is currently disabled.");
    }

    if (cfg.provider !== "backend") {
      throw new Error("The configured MediBridge AI provider is unavailable.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 65000);

    try {
      const response = await fetch(cfg.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: trimConversation(messages),
          assistantType
        }),
        signal: controller.signal
      });

      let data = null;
      try {
        data = await response.json();
      } catch (_) {
        data = null;
      }

      if (!response.ok) {
        const error = new Error(data?.error || "MediBridge AI is temporarily unavailable.");
        error.status = response.status;
        throw error;
      }

      const text = String(data?.text || "").trim();
      if (!text) {
        throw new Error("MediBridge AI returned an empty response.");
      }

      return {
        text,
        model: data?.model || null,
        provider: "backend"
      };
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("MediBridge AI request timed out. Please try again.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  window.MediBridgeAI = {
    isEnabled,
    providerName,
    isSecureBackendMode,
    chatWithAI
  };
})();
