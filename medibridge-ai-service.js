// MediBridge AI browser adapter.
// Every provider credential and provider request stays behind the server-side gateway.
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
    const maxMessages = Math.max(4, Number(cfg.maxConversationMessages || 16));
    const maxChars = Math.max(1000, Number(cfg.maxMessageCharacters || 6000));

    return (Array.isArray(messages) ? messages : [])
      .filter(message => message && ["user", "assistant"].includes(message.role))
      .slice(-maxMessages)
      .map(message => ({
        role: message.role,
        content: String(message.content || "").slice(-maxChars)
      }));
  }

  async function accessToken() {
    try {
      const client = window.supabaseClient;
      if (!client?.auth?.getSession) return null;
      const { data } = await client.auth.getSession();
      return data?.session?.access_token || null;
    } catch (_) {
      return null;
    }
  }

  async function responseError(response) {
    try {
      const data = await response.json();
      return data?.error || "MediBridge AI is temporarily unavailable.";
    } catch (_) {
      return "MediBridge AI is temporarily unavailable.";
    }
  }

  async function readNdjson(response, { onToken, onMeta }) {
    if (!response.body) throw new Error("MediBridge AI returned no response stream.");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let meta = {};

    const handleLine = line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let event;
      try {
        event = JSON.parse(trimmed);
      } catch (_) {
        return;
      }

      if (event.type === "meta") {
        meta = { ...meta, ...event };
        if (typeof onMeta === "function") onMeta(meta);
      } else if (event.type === "delta" && typeof event.text === "string") {
        text += event.text;
        if (typeof onToken === "function") onToken(event.text, text);
      } else if (event.type === "error") {
        throw new Error(event.error || "The AI response stream ended unexpectedly.");
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) handleLine(line);
    }

    buffer += decoder.decode();
    if (buffer.trim()) handleLine(buffer);

    return { text: text.trim(), meta };
  }

  async function getStatus() {
    const cfg = config();
    if (!cfg.enabled || !cfg.endpoint) return { status: "disabled" };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(cfg.endpoint, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      if (!response.ok) return { status: "unavailable" };
      return await response.json();
    } catch (_) {
      return { status: "unavailable" };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function chatWithAI({
    messages,
    assistantType = "patient",
    mode,
    onToken,
    onMeta,
    signal
  }) {
    const cfg = config();

    if (!cfg.enabled) throw new Error("MediBridge AI is currently disabled.");
    if (cfg.provider !== "backend") {
      throw new Error("The configured MediBridge AI provider is unavailable.");
    }

    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener("abort", abortFromCaller, { once: true });
    }

    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, Math.max(10000, Number(cfg.requestTimeoutMs || 60000)));

    try {
      const token = await accessToken();
      const headers = {
        "Content-Type": "application/json",
        Accept: cfg.streaming ? "application/x-ndjson, application/json" : "application/json"
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      const response = await fetch(cfg.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          apiVersion: cfg.apiVersion || "v1",
          messages: trimConversation(messages),
          assistantType,
          mode,
          stream: Boolean(cfg.streaming)
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const error = new Error(await responseError(response));
        error.status = response.status;
        throw error;
      }

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/x-ndjson")) {
        const streamed = await readNdjson(response, { onToken, onMeta });
        if (!streamed.text) throw new Error("MediBridge AI returned an empty response.");
        return {
          text: streamed.text,
          model: streamed.meta.model || response.headers.get("x-medibridge-model"),
          provider: streamed.meta.provider || "backend",
          requestId: streamed.meta.requestId || response.headers.get("x-medibridge-request-id"),
          urgent: Boolean(streamed.meta.urgent)
        };
      }

      const data = await response.json();
      const text = String(data?.text || "").trim();
      if (!text) throw new Error("MediBridge AI returned an empty response.");

      if (typeof onMeta === "function") onMeta(data);
      if (typeof onToken === "function") onToken(text, text);

      return {
        text,
        model: data?.model || null,
        provider: data?.provider || "backend",
        requestId: data?.requestId || response.headers.get("x-medibridge-request-id"),
        urgent: Boolean(data?.urgent)
      };
    } catch (error) {
      if (error?.name === "AbortError") {
        if (timedOut) throw new Error("MediBridge AI request timed out. Please try again.");
        const stopped = new Error("Generation stopped.");
        stopped.name = "AbortError";
        throw stopped;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener?.("abort", abortFromCaller);
    }
  }

  window.MediBridgeAI = {
    isEnabled,
    providerName,
    isSecureBackendMode,
    getStatus,
    chatWithAI
  };
})();
