// Aevy AI: Supabase Edge Function. The Gemini key lives ONLY here, as a secret (never in the website).
// Dashboard: Edge Functions > Create function "ai-chat" > paste this > Deploy (turn "Verify JWT" OFF; login is checked below).
// Secret: Edge Functions > Secrets > add GEMINI_API_KEY = your new key.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest";
const BASE = "You are Aevy AI, a professional, capable assistant inside the Aevy community. Answer accurately and directly. Use Markdown; put code in fenced blocks with a language tag. Reply in the user's language. If you are unsure, say so instead of guessing.";
const MODES: Record<string, string> = {
  assistant: "Help with any question or task: writing, analysis, planning, math, research, advice.",
  code: "You are a senior software engineer. You are an expert in Lua (including Roblox-style and CPM scripts), JavaScript, Python and general programming. Give complete, working, well-commented code, explain bugs, and suggest improvements. Never help write malware or cheats that harm other users.",
  writer: "You are a professional writer and editor. Draft, rewrite and polish text. Match the requested tone and length.",
  tutor: "You are a patient tutor. Explain step by step, check understanding, and give examples.",
  translate: "You are a professional translator. Translate faithfully, keep tone and formatting, and note ambiguities briefly.",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const hits = new Map<string, number[]>();
async function userId(req: Request): Promise<string | null> {
  const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!tok) return null;
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${tok}`, apikey: Deno.env.get("SUPABASE_ANON_KEY") || tok },
  });
  if (!r.ok) return null;
  const j = await r.json();
  return j?.is_anonymous ? "guest" : (j?.id || null);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const uid = await userId(req);
  if (!uid) return json({ error: "Please sign in to use Aevy AI." }, 401);
  if (uid === "guest") return json({ error: "Create a free account to use Aevy AI." }, 403);
  const now = Date.now(), recent = (hits.get(uid) || []).filter((t) => now - t < 60000);
  if (recent.length >= 15) return json({ error: "Too many messages. Wait a minute and try again." }, 429);
  hits.set(uid, [...recent, now]);
  const key = Deno.env.get("GEMINI_API_KEY") || "";
  if (!key) return json({ error: "AI is not configured yet (missing GEMINI_API_KEY secret)." }, 500);
  let b: any;
  try { b = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const msgs = Array.isArray(b.messages) ? b.messages.slice(-24) : [];
  if (!msgs.length) return json({ error: "Empty conversation" }, 400);
  let total = 0;
  const contents = msgs.map((m: any) => {
    const text = String(m.text || "").slice(0, 8000); total += text.length;
    const parts: any[] = [{ text: text || " " }];
    if (m.image && /^image\/(png|jpe?g|webp|gif)$/.test(m.image.mime || "") && String(m.image.data || "").length < 6_000_000)
      parts.push({ inline_data: { mime_type: m.image.mime, data: m.image.data } });
    return { role: m.role === "model" ? "model" : "user", parts };
  });
  if (total > 40000) return json({ error: "Conversation too long. Start a new chat." }, 413);
  const body: any = {
    systemInstruction: { parts: [{ text: BASE + " " + (MODES[b.mode] || MODES.assistant) }] },
    contents,
    generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
  };
  if (b.search) body.tools = [{ google_search: {} }];
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return json({ error: r.status === 429 ? "AI is busy right now. Try again in a minute." : (d?.error?.message || "AI request failed") }, 502);
  const c = d?.candidates?.[0];
  const text = (c?.content?.parts || []).map((p: any) => p.text || "").join("");
  if (!text) return json({ error: d?.promptFeedback?.blockReason ? "That request was blocked by the safety filter." : "No answer. Try rephrasing." }, 200);
  const sources = (c?.groundingMetadata?.groundingChunks || []).map((g: any) => g.web && { t: g.web.title, u: g.web.uri }).filter(Boolean).slice(0, 5);
  return json({ text, sources });
});
