import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getPublishableKey(): string {
  const legacy = Deno.env.get("SUPABASE_ANON_KEY");
  if (legacy) return legacy;
  const raw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (!raw) throw new Error("Missing Supabase publishable key");
  const keys = JSON.parse(raw);
  return keys.default ?? Object.values(keys)[0];
}

async function embedText(apiKey: string, text: string) {
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        model: "models/gemini-embedding-001",
        content: { parts: [{ text }] },
        outputDimensionality: 768,
      }),
    }
  );

  const body = await response.json();

  if (!response.ok) {
    throw new Error(
      body?.error?.message ||
      `Embedding request failed with status ${response.status}`
    );
  }

  return body?.embedding?.values ?? [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Authentication required" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const apiKey = Deno.env.get("GEMINI_API_KEY");

    if (!supabaseUrl) throw new Error("Missing SUPABASE_URL");
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

    const sb = createClient(supabaseUrl, getPublishableKey(), {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });

    const { data: userData, error: userError } = await sb.auth.getUser();
    if (userError || !userData.user) return json({ error: "Invalid session" }, 401);

    const { data: profile, error: profileError } = await sb
      .from("profiles")
      .select("role,verification_status")
      .eq("id", userData.user.id)
      .single();

    if (profileError) throw new Error(profileError.message);
    if (profile.role !== "admin" || profile.verification_status !== "verified") {
      return json({ error: "Verified admin required" }, 403);
    }

    const body = await req.json();
    const title = String(body.title ?? "").trim();
    const content = String(body.content ?? "").trim();
    const publisher = String(body.publisher ?? "").trim() || null;
    const sourceUrl = String(body.source_url ?? "").trim() || null;
    const topic = String(body.topic ?? "").trim() || null;

    if (!title || !content) return json({ error: "Title and content are required." }, 400);
    if (content.length > 12000) return json({ error: "Passage is too long. Keep each chunk under 12,000 characters." }, 400);

    const embedding = await embedText(apiKey, `${title}\n${topic ?? ""}\n${content}`);

    const { data, error } = await sb
      .from("clinical_knowledge_chunks")
      .insert({
        title,
        publisher,
        source_url: sourceUrl,
        topic,
        content,
        embedding,
        is_active: true,
        created_by: userData.user.id,
      })
      .select("id,title,publisher,source_url,topic,is_active,created_at")
      .single();

    if (error) throw new Error(error.message);
    return json({ ok: true, item: data });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : "Knowledge ingestion failed." }, 500);
  }
});
