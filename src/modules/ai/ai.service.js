import { PANEL_SCOPE_PROMPTS } from "./ai.prompts.js";

/**
 * ✅ AI Assistant service — server-side proxy to DeepSeek via OpenRouter.
 *
 * SECURITY:
 *  - The API key lives ONLY in the server environment; the client never sees it.
 *  - The client can only pick a "panel" whose role it actually owns (validated
 *    in the controller), so the assistant's knowledge scope always matches the
 *    caller's real permissions.
 */

const AI_BASE_URL = process.env.AI_BASE_URL || "https://openrouter.ai/api/v1";
const AI_MODEL = process.env.AI_MODEL || "deepseek/deepseek-v4-flash";
const AI_MAX_TOKENS = parseInt(process.env.AI_MAX_TOKENS || "900", 10);

/**
 * Forward a chat conversation to DeepSeek (OpenRouter) with the panel's system prompt.
 * Returns the assistant reply text.
 */
/**
 * ✅ Guarantee clean plain-text output: strip any Markdown artifacts the model
 * may still emit (bold/italic asterisks, heading hashes, stray backticks).
 * Ampersands are left intact when part of normal words (e.g. "R&D") but the
 * HTML-entity form "&amp;" is converted to "&"... actually never expose
 * entities to the UI: replace common HTML entities with plain equivalents.
 */
function sanitizeReply(text) {
  return String(text)
    .replace(/&amp;/gi, "&") // &amp; -> &
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/\*\*(.*?)\*\*/g, "$1") // **bold**
    .replace(/\*(.*?)\*/g, "$1") // *italic*
    .replace(/^\s*#{1,6}\s+/gm, "") // # headings
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1") // `code`
    .replace(/^\s*[*]\s+/gm, "- ") // normalize asterisk bullets to a dash
    .trim();
}

export async function chatWithAssistant({ panel, messages }) {
  const apiKey = process.env.AI_OPENROUTER_KEY;
  if (!apiKey) {
    const err = new Error("AI assistant is not configured");
    err.status = 503;
    throw err;
  }

  const systemPrompt = `${PANEL_SCOPE_PROMPTS[panel]}

Always reply in the SAME language the user writes in (Persian, English, or Turkish).
Structure every answer: open with a one-line direct answer, then use short bullet points or numbered steps. Keep it concise, practical, and friendly.
IMPORTANT: plain text only — NEVER use Markdown symbols. No asterisks (*) for bold/italic, no hashes (#) for headings, no ampersands (&). Use simple dashes (-) or numbers for lists and write key terms plainly.
If a request is outside your panel's scope, say so briefly and point the user to the right page or role instead.`;

  // ✅ Keep only the last N turns to bound cost/latency
  const trimmed = messages.slice(-12).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || "").slice(0, 6000),
  }));

  const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.BASE_URL || "https://digipoultry.com",
      "X-Title": "Egg Export Platform Assistant",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [{ role: "system", content: systemPrompt }, ...trimmed],
      max_tokens: AI_MAX_TOKENS,
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("AI proxy error:", res.status, body.slice(0, 300));
    const err = new Error("AI provider error");
    err.status = 502;
    throw err;
  }

  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content;
  if (!reply) {
    const err = new Error("Empty AI response");
    err.status = 502;
    throw err;
  }
  return sanitizeReply(reply);
}
