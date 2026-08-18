// Puter-specific provider implementation.
// All direct puter.ai.* calls must stay in this file.
// PUTER_AI_START
(function () {
  function assertPuter() {
    if (!window.puter || !window.puter.ai || typeof window.puter.ai.chat !== "function") {
      throw new Error("MediBridge AI is temporarily unavailable because the AI provider did not load.");
    }
  }

  function normalizeMessages(messages) {
    return (messages || [])
      .filter(m => m && ["system", "user", "assistant"].includes(m.role))
      .map(m => ({
        role: m.role,
        content: String(m.content || "")
      }));
  }

  function extractTextFromResponse(response) {
    if (!response) return "";

    if (typeof response === "string") return response;

    const content = response?.message?.content;
    if (typeof content === "string") return content;

    if (Array.isArray(content)) {
      return content
        .map(part => typeof part === "string" ? part : (part?.text || ""))
        .join("");
    }

    return response?.text || "";
  }

  async function chatOnce({ messages, model, tools, stream, onToken, shouldStop }) {
    assertPuter();

    const options = {
      model,
      stream: Boolean(stream)
    };

    if (Array.isArray(tools) && tools.length) {
      options.tools = tools;
    }

    if (!stream) {
      const response = await window.puter.ai.chat(normalizeMessages(messages), options);
      const text = extractTextFromResponse(response).trim();
      if (!text) throw new Error("The AI provider returned an empty response.");
      return text;
    }

    const response = await window.puter.ai.chat(normalizeMessages(messages), options);
    let text = "";

    for await (const part of response) {
      if (typeof shouldStop === "function" && shouldStop()) {
        break;
      }

      if (part?.type === "error") {
        throw new Error(part?.message || "The AI stream was interrupted.");
      }

      if (part?.type === "text" && part?.text) {
        text += part.text;
        if (typeof onToken === "function") onToken(part.text, text);
      } else if (part?.text) {
        text += part.text;
        if (typeof onToken === "function") onToken(part.text, text);
      }
    }

    if (!text.trim()) {
      if (typeof shouldStop === "function" && shouldStop()) {
        return text;
      }
      throw new Error("The AI provider returned an empty response.");
    }

    return text;
  }

  async function sendAIMessage({
    messages,
    model,
    fallbackModels = [],
    tools = [],
    stream = true,
    onToken,
    shouldStop
  }) {
    const candidates = [model, ...fallbackModels].filter(Boolean);
    let lastError = null;

    for (const candidate of candidates) {
      try {
        const text = await chatOnce({
          messages,
          model: candidate,
          tools,
          stream,
          onToken,
          shouldStop
        });

        return {
          text,
          model: candidate,
          provider: "puter"
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error("MediBridge AI request failed.");
  }

  async function streamAIMessage(options) {
    return sendAIMessage({ ...options, stream: true });
  }

  async function analyzeImage({ prompt, image, model }) {
    assertPuter();

    if (!image) throw new Error("Choose an image first.");

    const response = await window.puter.ai.chat(
      String(prompt || "Describe the visible contents of this image."),
      image,
      false,
      { model }
    );

    const text = extractTextFromResponse(response).trim();
    if (!text) throw new Error("The AI provider returned an empty image-analysis response.");

    return { text, model, provider: "puter" };
  }

  async function searchWithAI({ messages, model, fallbackModels = [], stream = true, onToken, shouldStop }) {
    return sendAIMessage({
      messages,
      model,
      fallbackModels,
      stream,
      onToken,
      shouldStop,
      tools: [{ type: "web_search" }]
    });
  }

  async function textToSpeech(text, options = {}) {
    assertPuter();

    if (!window.puter.ai.txt2speech) {
      throw new Error("Text-to-speech is not available in the current AI provider.");
    }

    return window.puter.ai.txt2speech(String(text || ""), {
      provider: options.provider || "openai"
    });
  }

  window.MediBridgePuterAI = {
    sendAIMessage,
    streamAIMessage,
    analyzeImage,
    searchWithAI,
    textToSpeech
  };
})();
// PUTER_AI_END
