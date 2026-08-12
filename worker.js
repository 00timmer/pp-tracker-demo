// NVIDIA proxy for PP Tracker — Cloudflare Worker
//
// Why this exists: NVIDIA's API sends no Access-Control-Allow-Origin header, so
// a browser refuses to call it from a web page. This Worker sits in front of it,
// adds the CORS headers a browser needs, and keeps the API key server-side so it
// never ships inside index.html.
//
// ── Deploy ────────────────────────────────────────────────────────────────────
//   npm i -g wrangler
//   wrangler login
//   wrangler deploy                       # uses wrangler.toml next to this file
//   wrangler secret put NVIDIA_KEY        # paste your nvapi-… key when prompted
//
// Then copy the printed https://<name>.<you>.workers.dev URL and paste it into
// the API-key box in PP Tracker. The app recognises a URL as the NVIDIA proxy.
//
// The Worker URL is public: it ships inside the app, because a static page cannot
// keep a secret. ALLOWED_ORIGINS stops other *websites* from using it (browsers set
// Origin honestly), but a client that forges the header is not stopped by it — so a
// per-IP rate limit bounds what any single caller can consume. The API key itself is
// never exposed either way; it stays in the NVIDIA_KEY secret, server-side.

const ALLOWED_ORIGINS = [
  "https://00timmer.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
];

const UPSTREAM = "https://integrate.api.nvidia.com/v1/chat/completions";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = ALLOWED_ORIGINS.includes(origin);

    // Preflight. Answer it even when the origin is wrong, just without the
    // allow header — the browser then blocks it, which is the correct outcome.
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: allowed ? corsHeaders(origin) : { Vary: "Origin" },
      });
    }

    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "Origin not allowed: " + (origin || "(none)") }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Rate limit before doing any upstream work, so abuse costs nothing.
    if (env.RATE_LIMITER) {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) {
        return new Response(
          JSON.stringify({ error: "Rate limit reached — 20 requests a minute. Try again shortly." }),
          { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
        );
      }
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST only" }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    if (!env.NVIDIA_KEY) {
      return new Response(
        JSON.stringify({
          error: "NVIDIA_KEY secret is not set. Run: wrangler secret put NVIDIA_KEY",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
      );
    }

    let upstream;
    try {
      upstream = await fetch(UPSTREAM, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.NVIDIA_KEY}`,
        },
        body: await request.text(),
      });
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "Could not reach NVIDIA: " + String(e && e.message || e) }),
        { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } }
      );
    }

    // Pass the upstream body and status straight through, so the app still sees
    // NVIDIA's own error text (bad model name, rate limit, no credit) verbatim.
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") || "application/json",
        ...corsHeaders(origin),
      },
    });
  },
};
