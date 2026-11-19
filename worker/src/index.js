import { PRESETS, DEFAULTS, ALIASES } from "./provider-config.js";

const PAGE_SIZE_MAX = 100;

/* ---------- small helpers ---------- */
function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": (env && env.ALLOWED_ORIGIN) || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
  };
}
function json(env, body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders(env), ...headers } });
}
function pathValue(obj, path) {
  if (!path) return undefined;
  return String(path).replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean).reduce((v, k) => v == null ? undefined : v[k], obj);
}
function empty(v) { return v == null || v === "" || (Array.isArray(v) && !v.length); }
function asText(v) {
  if (v == null) return "";
  if (Array.isArray(v)) return asText(v[0]);
  if (typeof v === "object") return asText(v.url ?? v.src ?? v.link ?? v.href ?? v.name ?? v.title ?? "");
  return String(v);
}
function safeWebUrl(value) {
  const s = asText(value).trim();
  if (!s) return "";
  try { const u = new URL(s.startsWith("//") ? "https:" + s : s); return u.protocol === "https:" || u.protocol === "http:" ? u.href : ""; } catch { return ""; }
}
function slugify(value) {
  const out = String(value || "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
  if (out) return out;
  let h = 0; for (const c of String(value || "category")) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
  return "category-" + Math.abs(h).toString(36);
}
function parseDuration(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;
  const s = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Math.floor(Number(s));
  let m = s.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
  if (m) return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + Math.floor(+m[3] || 0);
  m = s.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (m) return (+m[1] || 0) * 3600 + +m[2] * 60 + +m[3];
  return null;
}

/* ---------- configuration: preset or generic, plus wrangler vars ---------- */
function getConfig(env) {
  const presetName = String(env.API_PRESET || "").trim().toLowerCase();
  const preset = PRESETS[presetName];
  if (presetName && !preset) throw new Error("Unknown API_PRESET '" + presetName + "'. Use: " + Object.keys(PRESETS).join(", ") + " or leave empty and set API_BASE_URL");
  const cfg = { ...DEFAULTS, ...(preset || {}) };
  const set = (key, v) => { if (v != null && String(v).trim() !== "") cfg[key] = String(v).trim(); };
  set("baseUrl", env.API_BASE_URL); set("listPath", env.API_LIST_PATH); set("searchPath", env.API_SEARCH_PATH);
  set("categoriesPath", env.API_CATEGORIES_PATH); set("itemsPath", env.API_ITEMS_PATH); set("authMode", env.API_AUTH_MODE);
  if (env.API_AUTH_NAME && String(env.API_AUTH_NAME).trim()) {
    if (cfg.authMode === "query") cfg.authQueryParameter = String(env.API_AUTH_NAME).trim();
    else { cfg.authHeader = String(env.API_AUTH_NAME).trim(); if (!preset) cfg.authPrefix = /^authorization$/i.test(cfg.authHeader) ? "Bearer " : ""; }
  }
  if (env.API_FIELDS && String(env.API_FIELDS).trim()) {
    try { cfg.fields = { ...cfg.fields, ...JSON.parse(env.API_FIELDS) }; } catch { throw new Error("API_FIELDS is not valid JSON"); }
  }
  if (!cfg.listPath && cfg.baseUrl) cfg.listPath = "";
  cfg.configured = !!cfg.baseUrl;
  return cfg;
}

/* Safety filter: anything that mentions minors is never listed (videos and categories). */
const BLOCKED = /\b(child|children|kid|kids|underage|under-age|minor|minors|loli|lolita|preteen|pre-teen|jailbait|toddler|infant|schoolgirl|school girl)\b/i;

/* ---------- field detection ---------- */
function field(item, name, cfg, extra) {
  if (cfg.fields && cfg.fields[name]) return pathValue(item, cfg.fields[name]);
  if (extra && !empty(extra[name])) return extra[name];
  for (const p of ALIASES[name] || []) { const v = pathValue(item, p); if (!empty(v)) return v; }
  return undefined;
}
function categoryNames(value) {
  let raw = value;
  if (typeof raw === "string") raw = raw.split(/[,|;]/);
  if (!Array.isArray(raw)) raw = raw == null ? [] : [raw];
  return [...new Set(raw.map(x => (x && typeof x === "object" ? asText(x.name ?? x.title ?? x.label ?? x.slug) : String(x)).trim()).filter(x => x && x.length <= 60 && !BLOCKED.test(x)))].slice(0, 5);
}
function normalizeItem(item, cfg) {
  if (!item || typeof item !== "object") return null;
  const extra = cfg.map ? (cfg.map(item) || {}) : null;
  const id = asText(field(item, "id", cfg, extra));
  let title = asText(field(item, "title", cfg, extra)).trim();
  if (!id) return null;
  if (!title) title = "Untitled video";
  if (BLOCKED.test(title + " " + asText(field(item, "categories", cfg, extra)))) return null;
  const names = categoryNames(field(item, "categories", cfg, extra));
  let playback = safeWebUrl(field(item, "playback", cfg, extra));
  if (cfg.embedUrlTemplate) playback = safeWebUrl(cfg.embedUrlTemplate.replaceAll("{id}", encodeURIComponent(id))) || playback;
  const source = safeWebUrl(field(item, "source", cfg, extra));
  if (!playback) playback = source;
  const pub = asText(field(item, "published", cfg, extra));
  let date = null;
  if (pub) { const t = /^\d{10}$/.test(pub) ? Number(pub) * 1000 : /^\d{13}$/.test(pub) ? Number(pub) : Date.parse(pub); if (Number.isFinite(t)) date = new Date(t).toISOString(); }
  const views = Number(asText(field(item, "views", cfg, extra)));
  return {
    row: {
      provider: cfg.provider,
      external_id: id.slice(0, 300),
      title: title.slice(0, 300),
      description: asText(field(item, "description", cfg, extra)).slice(0, 12000),
      thumbnail_url: safeWebUrl(field(item, "thumbnail", cfg, extra)),
      playback_url: playback,
      source_url: source,
      channel_title: asText(field(item, "channel", cfg, extra)).slice(0, 200),
      category_slugs: [...new Set(names.map(slugify))],
      duration_seconds: parseDuration(field(item, "durationSeconds", cfg, extra)),
      view_count: Number.isFinite(views) && views >= 0 ? Math.floor(views) : 0,
      published_at: date
    },
    categories: names
  };
}
/* Finds the list of videos inside any JSON response. */
function findItems(payload, itemsPath) {
  if (itemsPath) { const v = pathValue(payload, itemsPath); if (Array.isArray(v)) return v; }
  if (Array.isArray(payload)) return payload;
  let best = [];
  const walk = (node, depth) => {
    if (!node || typeof node !== "object" || depth > 4) return;
    if (Array.isArray(node)) { if (node.length > best.length && node.some(x => x && typeof x === "object" && !Array.isArray(x))) best = node; return; }
    for (const k of Object.keys(node)) walk(node[k], depth + 1);
  };
  walk(payload, 0);
  return best;
}
function detectHasMore(payload, rows, page, limit) {
  const p = payload && typeof payload === "object" ? payload : {};
  const meta = p.meta || p.pagination || p.paging || {};
  for (const k of ["has_more", "hasMore", "has_next", "hasNext"]) { if (typeof p[k] === "boolean") return p[k]; if (typeof meta[k] === "boolean") return meta[k]; }
  for (const k of ["next_page", "nextPage", "next", "next_page_url", "nextPageToken"]) { if (k in p) return !!p[k]; if (k in meta) return !!meta[k]; }
  const pages = Number(p.total_pages ?? p.totalPages ?? p.pages ?? meta.total_pages ?? meta.pages ?? meta.last_page);
  if (Number.isFinite(pages) && pages > 0) return page < pages;
  const total = Number(p.total_results ?? p.totalResults ?? p.total_count ?? p.total ?? p.totalHits ?? meta.total ?? meta.total_results ?? meta.count);
  if (Number.isFinite(total) && total > 0) return page * limit < total;
  return rows.length >= limit;
}

/* ---------- Supabase cache (optional) ---------- */
function dbReady(env) { return !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY); }
async function dbRequest(env, path, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("apikey", env.SUPABASE_SERVICE_ROLE_KEY);
  headers.set("Authorization", "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY);
  if (init.body) headers.set("Content-Type", "application/json");
  const res = await fetch(env.SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/" + path, { ...init, headers });
  if (!res.ok) throw new Error("Supabase request failed (" + res.status + ")");
  return res.status === 204 ? null : res.json();
}
const MERGE = { Prefer: "resolution=merge-duplicates,return=minimal" };
async function saveToCatalog(env, cfg, rows, cats) {
  if (!dbReady(env)) return;
  try {
    const now = new Date().toISOString();
    if (cats.size) await dbRequest(env, "video_categories?on_conflict=slug", { method: "POST", headers: MERGE, body: JSON.stringify([...cats.values()].map(c => ({ ...c, provider: cfg.provider, updated_at: now }))) });
    if (rows.length) await dbRequest(env, "video_catalog?on_conflict=provider,external_id", { method: "POST", headers: MERGE, body: JSON.stringify(rows.map(r => ({ ...r, synced_at: now, updated_at: now }))) });
  } catch (e) { console.warn("Catalog cache write failed:", e.message); }
}

/* ---------- provider requests ---------- */
async function upstream(cfg, env, path, params) {
  const base = new URL(cfg.baseUrl);
  const target = new URL(path || "", base.href.endsWith("/") ? base : base.href + "/");
  for (const [k, v] of Object.entries(params)) if (k && v != null && v !== "") target.searchParams.set(k, String(v));
  const headers = new Headers({ Accept: "application/json" });
  if (env.VIDEO_API_KEY && cfg.authMode === "query") target.searchParams.set(cfg.authQueryParameter || "api_key", env.VIDEO_API_KEY);
  if (env.VIDEO_API_KEY && cfg.authMode === "header") headers.set(cfg.authHeader || "Authorization", (cfg.authPrefix || "") + env.VIDEO_API_KEY);
  const res = await fetch(target, { headers, signal: AbortSignal.timeout(15000) });
  if (res.status === 401 || res.status === 403) throw new Error("Video provider rejected the API key (HTTP " + res.status + "). Check: wrangler secret put VIDEO_API_KEY");
  if (!res.ok) throw new Error("Video provider returned HTTP " + res.status);
  return res.json();
}
function topicList(cfg) { return (cfg.topics || []).map(name => ({ slug: slugify(name), name })); }
async function knownCategory(cfg, env, slug) {
  const t = topicList(cfg).find(c => c.slug === slug);
  if (t) return { ...t, external_id: null };
  if (dbReady(env)) {
    try {
      const r = await dbRequest(env, "video_categories?select=slug,name,external_id&slug=eq." + encodeURIComponent(slug) + "&limit=1");
      if (r && r[0]) return r[0];
    } catch { /* fall through */ }
  }
  return { slug, name: slug.replace(/-/g, " "), external_id: null };
}
function dbShape(r) { return { ...r, id: r.id || r.provider + ":" + r.external_id }; }

async function listVideos(searchParams, env, ctx) {
  const params = Object.fromEntries(searchParams instanceof URLSearchParams ? searchParams : Object.entries(searchParams || {}));
  const cfg = getConfig(env);
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(PAGE_SIZE_MAX, Math.max(1, Number(params.limit) || 24));
  const q = String(params.q || "").trim().slice(0, 160);
  const categorySlug = String(params.category || "").trim().slice(0, 80);
  const sort = params.sort === "popular" ? "popular" : "newest";
  if (!cfg.configured) return { items: [], page, pageSize: limit, hasMore: false, configured: false, source: "none" };

  try {
    const cat = categorySlug ? await knownCategory(cfg, env, categorySlug) : null;
    let search = q;
    if (cat && cfg.categoryAsSearch) search = (q + " " + cat.name).trim();
    const values = { ...(cfg.extraParams || {}), [cfg.pageParameter]: page, [cfg.limitParameter]: limit };
    if (!search && cfg.defaultQuery) search = cfg.defaultQuery;
    if (search) values[cfg.searchParameter] = search;
    if (cat && cfg.categoryParameter && !cfg.categoryAsSearch) values[cfg.categoryParameter] = cat.external_id || (cfg.topics && cfg.topics.length ? cat.slug : cat.name);
    if (cfg.sortParameter) values[cfg.sortParameter] = sort === "popular" ? cfg.sortPopular : cfg.sortNewest;
    const path = search && cfg.searchPath ? cfg.searchPath : cfg.listPath;   // (defaultQuery counts as a search)
    const payload = await upstream(cfg, env, path, values);
    const raw = findItems(payload, cfg.itemsPath);
    const rows = [], cats = new Map();
    for (const it of raw) {
      const n = normalizeItem(it, cfg); if (!n) continue;
      rows.push(n.row);
      n.categories.forEach(name => cats.set(slugify(name), { slug: slugify(name), name: name.slice(0, 120), external_id: null }));
    }
    if (ctx && ctx.waitUntil) ctx.waitUntil(saveToCatalog(env, cfg, rows, cats)); else await saveToCatalog(env, cfg, rows, cats);
    const items = rows.map(r => ({ ...r, id: r.provider + ":" + r.external_id }));
    if (sort === "popular" && !cfg.sortParameter) items.sort((a, b) => b.view_count - a.view_count);
    return { items, page, pageSize: limit, hasMore: raw.length > 0 && detectHasMore(payload, raw, page, limit), configured: true, source: "provider" };
  } catch (e) {
    if (!dbReady(env)) throw e;
    console.warn("Provider failed, serving cached catalog:", e.message);
    const rpc = await dbRequest(env, "rpc/search_video_catalog", { method: "POST", body: JSON.stringify({ p_query: q, p_category: categorySlug || null, p_page: page, p_page_size: limit, p_sort: sort }) });
    const items = (Array.isArray(rpc) ? rpc : []).map(dbShape);
    return { items, page, pageSize: limit, hasMore: items.length >= limit, configured: true, source: "cache", warning: e.message };
  }
}

async function listCategories(env, ctx) {
  const cfg = getConfig(env);
  const out = new Map();
  const add = (c, ext) => { if (c && c.name && !out.has(c.slug)) out.set(c.slug, { slug: c.slug, name: c.name, provider: cfg.provider, external_id: ext ?? c.external_id ?? null }); };
  if (cfg.configured && cfg.categoriesPath) {
    try {
      const payload = await upstream(cfg, env, cfg.categoriesPath, {});
      const raw = cfg.categoriesItemsPath ? pathValue(payload, cfg.categoriesItemsPath) : null;
      for (const it of (Array.isArray(raw) ? raw : findItems(payload, ""))) {
        const name = typeof it === "string" ? it : asText(field(it, "categoryName", cfg));
        if (!name || BLOCKED.test(name)) continue;
        const ext = typeof it === "string" ? null : asText(field(it, "categoryId", cfg)) || null;
        add({ slug: slugify(name), name: name.slice(0, 120) }, ext);
      }
    } catch (e) { console.warn("Categories fetch failed:", e.message); }
  }
  topicList(cfg).forEach(c => add(c));
  if (dbReady(env)) {
    try { (await dbRequest(env, "video_categories?select=slug,name,external_id&order=name.asc&limit=500") || []).forEach(c => add(c)); } catch { /* ignore */ }
    const fresh = [...out.values()].filter(c => c.provider === cfg.provider);
    if (fresh.length) { const p = saveToCatalog(env, cfg, [], new Map(fresh.map(c => [c.slug, c]))); if (ctx && ctx.waitUntil) ctx.waitUntil(p); else await p; }
  }
  return { items: [...out.values()].map(({ slug, name }) => ({ slug, name })), configured: cfg.configured };
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(env) });
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health") {
        const cfg = getConfig(env);
        return json(env, { ok: true, providerConfigured: cfg.configured, provider: cfg.provider, apiKeySet: !!env.VIDEO_API_KEY, cacheConfigured: dbReady(env), secretsConfigured: dbReady(env) });
      }
      if (url.pathname === "/api/videos" && request.method === "GET") {
        const cfg = getConfig(env);
        return json(env, await listVideos(url.searchParams, env, ctx), 200, { "Cache-Control": "public, max-age=20, s-maxage=" + Math.max(0, Math.min(300, Number(cfg.cacheSeconds) || 60)) });
      }
      if (url.pathname === "/api/categories" && request.method === "GET") {
        return json(env, await listCategories(env, ctx), 200, { "Cache-Control": "public, max-age=60, s-maxage=300" });
      }
      if (url.pathname === "/api/sync" && request.method === "POST") {
        if (!env.ADMIN_SYNC_TOKEN || request.headers.get("Authorization") !== "Bearer " + env.ADMIN_SYNC_TOKEN) return json(env, { error: "Unauthorized" }, 401);
        const r = await listVideos(new URLSearchParams({ page: "1", limit: String(getConfig(env).syncPageSize || 50) }), env, null);
        await listCategories(env, null);
        return json(env, { synced: r.items.length });
      }
      return json(env, { error: "Not found" }, 404);
    } catch (e) {
      console.error("Aevy video API error:", e.message);
      return json(env, { error: e.message }, /Unknown API_PRESET|not valid JSON/.test(e.message) ? 503 : 502);
    }
  }
};
