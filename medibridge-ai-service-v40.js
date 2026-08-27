// MediBridge AI service abstraction.
// UI code calls this service; provider secrets and provider API calls stay server-side.
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

  async function chatWithAI({ messages, assistantType = "patient", signal }) {
    const cfg = config();

    if (!cfg.enabled) {
      throw new Error("MediBridge AI is currently disabled.");
    }

    if (cfg.provider !== "backend") {
      throw new Error("The configured MediBridge AI provider is unavailable.");
    }

    if (typeof supabaseClient === "undefined") {
      throw new Error("MediBridge authentication is unavailable.");
    }

    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (sessionError || !accessToken) {
      throw new Error("Sign in again to use MediBridge AI.");
    }

    const controller = new AbortController();
    let timedOut = false;
    let cancelledByCaller = false;
    const abortFromCaller = () => {
      cancelledByCaller = true;
      controller.abort();
    };
    if (signal?.aborted) abortFromCaller();
    else signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 65000);

    try {
      const response = await fetch(cfg.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`
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
        if (cancelledByCaller && !timedOut) {
          const cancelled = new Error("MediBridge AI generation was stopped.");
          cancelled.code = "MEDIBRIDGE_AI_CANCELLED";
          throw cancelled;
        }
        throw new Error("MediBridge AI request timed out. Please try again.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  window.MediBridgeAI = {
    isEnabled,
    providerName,
    isSecureBackendMode,
    chatWithAI
  };
})();
