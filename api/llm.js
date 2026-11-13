// POST /api/llm — one AI endpoint for the whole app, shaped like Base44's InvokeLLM:
//   { prompt, response_json_schema?, file_urls?, images?, add_context_from_internet?, quality?: "high", thinking?: false }
//   → { result }  (parsed object when a schema is given, otherwise text)
//
// Runs through Vercel AI Gateway. Authentication is the project's Vercel OIDC
// token, which Vercel passes to every function invocation, so there is no API
// key anywhere. Models come from the AI Gateway Free Tier list.
import { generateText, Output, jsonSchema, gateway } from "ai";

// Free Tier models (vercel.com/ai-gateway/models?freeTier=true), tried in order.
// Both read images (map screenshots) and return structured output.
const MODELS = (process.env.AI_MODELS || "google/gemini-2.5-flash-lite,openai/gpt-4.1-mini").split(",").map((s) => s.trim());
// Free Tier models for calls that ask for quality: "high".
const QUALITY_MODELS = (process.env.AI_QUALITY_MODELS || "google/gemini-2.5-flash,google/gemini-2.5-flash-lite").split(",").map((s) => s.trim());
// Free Tier model with built-in web search, for add_context_from_internet.
const SEARCH_MODEL = process.env.AI_SEARCH_MODEL || "perplexity/sonar";

const MAX_PROMPT = 60000;
const MAX_IMAGES = 4;

// This is a private app: only a signed-in user on the allow-list may spend AI
// credits. The caller's Supabase token is checked by Supabase itself (an invalid
// token is rejected there), and is_allowed() answers for that user's email.
async function isAllowedUser(req) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const auth = req.headers.authorization || "";
  if (!url || !anonKey || !auth.startsWith("Bearer ")) return false;
  try {
    const r = await fetch(`${url}/rest/v1/rpc/is_allowed`, {
      method: "POST",
      headers: { apikey: anonKey, Authorization: auth, "Content-Type": "application/json" },
      body: "{}",
    });
    return r.ok && (await r.json()) === true;
  } catch {
    return false;
  }
}

// Make the schema strict: every field required, no extra fields. Models follow
// strict schemas far more reliably (looser ones made Gemini loop and cut off),
// and OpenAI models refuse non-strict ones.
function strictSchema(schema) {
  if (!schema || typeof schema !== "object") return schema;
  if (schema.type === "object") {
    const properties = {};
    for (const [k, v] of Object.entries(schema.properties || {})) properties[k] = strictSchema(v);
    return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
  }
  if (schema.type === "array") return { type: "array", items: strictSchema(schema.items || { type: "string" }) };
  const out = { type: schema.type };
  if (schema.enum) out.enum = schema.enum;
  if (schema.description) out.description = schema.description;
  return out;
}

function imageParts(input) {
  const parts = [];
  for (const img of (input.images || []).slice(0, MAX_IMAGES)) {
    parts.push({ type: "image", image: img.data, mediaType: img.media_type });
  }
  for (const url of (input.file_urls || []).slice(0, MAX_IMAGES - parts.length)) {
    parts.push({ type: "image", image: new URL(url) });
  }
  return parts;
}

async function run(modelId, input) {
  const prompt = String(input.prompt || "").slice(0, MAX_PROMPT);
  const images = imageParts(input);
  const base = {
    model: gateway(modelId),
    maxOutputTokens: Math.min(Number(input.max_tokens) || 8000, 16000),
    maxRetries: 1,
    // thinking: false → answer directly (Gemini otherwise reasons first; ~1s instead of 3-8s)
    // thinking: "light" → a short think (~2s) that still double-checks the answer
    ...(input.thinking === false
      ? { providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } } }
      : input.thinking === "light"
      ? { providerOptions: { google: { thinkingConfig: { thinkingBudget: 512 } } } }
      : {}),
    ...(images.length
      ? { messages: [{ role: "user", content: [...images, { type: "text", text: prompt }] }] }
      : { prompt }),
  };
  const r = input.response_json_schema
    ? await generateText({ ...base, output: Output.object({ schema: jsonSchema(strictSchema(input.response_json_schema)) }) })
    : await generateText(base);
  // Web-search models report the pages they used
  const sources = (r.sources || [])
    .filter((s) => s.sourceType === "url" && s.url)
    .map((s) => ({ url: s.url, title: s.title || "" }));
  return { value: input.response_json_schema ? r.output : r.text, sources };
}

function status(e) {
  return e?.statusCode || e?.status || e?.cause?.statusCode || 500;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!(await isAllowedUser(req))) return res.status(401).json({ error: "Sign in required" });

  // Make the per-request OIDC token visible to the AI SDK in every runtime setup.
  const oidc = req.headers["x-vercel-oidc-token"];
  if (oidc) process.env.VERCEL_OIDC_TOKEN = oidc;

  let input;
  try {
    input = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }
  if (!String(input.prompt || "").trim()) return res.status(400).json({ error: "Missing prompt" });

  const models = input.search_only // a web answer or nothing: a model without search would only guess
    ? [SEARCH_MODEL]
    : input.add_context_from_internet
    ? [SEARCH_MODEL, ...MODELS]
    : input.quality === "strict" // only the strong model: the caller waits and retries instead of using a weaker one
    ? QUALITY_MODELS.slice(0, 1)
    : input.quality === "high"
    ? QUALITY_MODELS
    : MODELS;
  let lastError = null;
  for (const modelId of models) {
    try {
      const { value, sources } = await run(modelId, input);
      // web_search tells the caller whether the answer really came from the search
      // model, or from a fallback model that only knows what it was trained on.
      return res.status(200).json({ result: value, sources, model: modelId, web_search: modelId === SEARCH_MODEL });
    } catch (e) {
      lastError = e;
      console.error(`AI Gateway call failed on ${modelId}:`, e?.message);
      // Account/auth problems and bad requests won't succeed on another model either
      const code = status(e);
      if (code === 401 || code === 403) break;
      if (code === 400 && !/schema|output|object|json/i.test(e?.message || "")) break;
    }
  }
  const code = status(lastError);
  if (code === 429 || code === 402) {
    const wait = Number((lastError?.message || "").match(/Retry after (\d+)s/)?.[1]) || 30;
    res.setHeader("Retry-After", String(wait));
    return res.status(429).json({ error: "The free AI limit is reached for now. Try again a bit later — everything that isn't AI keeps working." });
  }
  if (/credit card/i.test(lastError?.message || "")) {
    return res.status(503).json({
      error: "AI is off until the free AI Gateway credits are unlocked: add a card in Vercel → AI Gateway (no charge unless you buy credits).",
      code: "GATEWAY_CARD_REQUIRED",
    });
  }
  if (code === 401 || code === 403) {
    return res.status(503).json({ error: "AI Gateway isn't available for this project yet. In Vercel, open the team's AI Gateway page and enable the free credits." });
  }
  return res.status(500).json({ error: lastError?.message || "AI request failed" });
}
