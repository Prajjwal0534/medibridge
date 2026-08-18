const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const SYSTEM_PROMPTS = {
  patient: `You are MediBridge AI, a patient-facing healthcare information assistant. Help with general health information, medical terminology in simple language, understanding reports and prescriptions in user-friendly terms, preparing questions for doctors, care navigation, appointment guidance, health education, and using MediBridge. You are not a doctor and must not present yourself as one. Do not claim a guaranteed diagnosis or treatment outcome. Encourage professional evaluation when appropriate. If the user's symptoms could reasonably indicate an urgent or life-threatening situation, clearly advise immediate professional or emergency medical care rather than relying on AI. Be concise, clear, and avoid unnecessary alarm.`,

  doctor: `You are MediBridge AI, a clinician-facing decision-support assistant. Help with clinical information retrieval, summarization, differential brainstorming, medical terminology, report/document interpretation support, clinical note drafting, reference assistance, and follow-up question generation. You are decision support only. Do not claim autonomous clinical authority and do not replace clinician judgment, direct examination, local protocols, or appropriate specialist review. Clearly distinguish uncertainty from established information. Do not invent patient-specific facts that were not provided.`,
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function cleanMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter(
      (m) =>
        m &&
        ["user", "assistant"].includes(m.role) &&
        typeof m.content === "string"
    )
    .slice(-10)
    .map((m) => ({
      role: m.role,
      content: m.content.trim().slice(-5000),
    }))
    .filter((m) => m.content.length > 0);
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("GROQ_API_KEY is not configured.");
    return json(503, {
      error: "MediBridge AI is temporarily unavailable. Please try again.",
    });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_) {
    return json(400, { error: "Invalid request." });
  }

  const assistantType = body.assistantType === "doctor" ? "doctor" : "patient";

  const messages = cleanMessages(body.messages);

  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return json(400, { error: "Please enter a message." });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50000);

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPTS[assistantType] },
          ...messages,
        ],
        temperature: 0.6,
        top_p: 0.95,
        max_completion_tokens: 2048,
        stream: false,
      }),
      signal: controller.signal,
    });

    let data = null;
    try {
      data = await response.json();
    } catch (_) {
      data = null;
    }

    if (!response.ok) {
      const status = response.status;

      console.error("Groq request failed", {
        status,
        providerCode: data?.error?.code || null,
      });

      if (status === 429) {
        return json(429, {
          error:
            "MediBridge AI has reached its temporary free-tier limit. Please try again shortly.",
        });
      }

      if (status === 404) {
        return json(503, {
          error: "MediBridge AI model is temporarily unavailable.",
        });
      }

      return json(503, {
        error: "MediBridge AI is temporarily unavailable. Please try again.",
      });
    }

    const text = String(data?.choices?.[0]?.message?.content || "").trim();

    if (!text) {
      console.error("Groq returned an empty response.");
      return json(502, {
        error: "MediBridge AI returned no response. Please try again.",
      });
    }

    return json(200, {
      text,
      model: GROQ_MODEL,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      console.error("Groq request timed out.");
      return json(504, {
        error: "MediBridge AI timed out. Please try again.",
      });
    }

    console.error("Groq network/function failure", {
      name: error?.name || "Error",
    });

    return json(502, {
      error: "MediBridge AI is temporarily unavailable. Please try again.",
    });
  } finally {
    clearTimeout(timeout);
  }
};
