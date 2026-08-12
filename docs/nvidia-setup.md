# NVIDIA via a Cloudflare Worker

Gemini and Claude work in the app with nothing but a pasted key. **NVIDIA does not, and cannot.**
This document explains why, and how to set up the proxy that makes it work.

## Why a proxy is required

NVIDIA's API sends no `Access-Control-Allow-Origin` header — on the preflight or on the response.
Browsers refuse to hand such a response to the page, so **a web page cannot call NVIDIA directly**.

This is not something app code can fix. The block happens inside the browser before the page sees
the reply. Desktop AI clients reach NVIDIA directly only because they are native apps (Electron
and similar), where no browser CORS policy applies.

The Worker in this repo sits between the two: the page calls the Worker, the Worker calls NVIDIA
server-to-server (where CORS is irrelevant), and returns the answer with the header a browser
needs. It also keeps the API key server-side, so the key never ships inside a public web page.

## Deploy

```
npm i -g wrangler          # or use npx wrangler@4 below
wrangler login             # opens a browser, click Allow — one time
wrangler deploy            # prints your https://<name>.<subdomain>.workers.dev URL
wrangler secret put NVIDIA_KEY
```

The last command prompts `Enter a secret value:` — paste your `nvapi-…` key there. It is stored
encrypted in Cloudflare. Run it in a real terminal; it needs an interactive prompt.

## Connect the app

Paste the `https://….workers.dev` URL into the API-key box in the app header and press
**Connect**. You should see `✓ connected` and a model dropdown appear.

The URL is stored per-browser, so do this once on each machine you use.

**Never paste an `nvapi-` key into the app** — the app will refuse it and tell you why. The key
belongs in the Worker secret; anything in the page is public.

## Which value goes where

| Value | Goes into | What it is |
|---|---|---|
| `nvapi-…` | `wrangler secret put NVIDIA_KEY` | the real credential, server-side only |
| `https://….workers.dev` | the app's key box | an endpoint the browser calls |

## Request path

```
Browser ──POST {model, messages}──▶ Worker ──+ Authorization: Bearer nvapi-…──▶ NVIDIA
                                       │                                          │
Browser ◀──── + access-control-allow-origin ─────────────────────────────────────┘
```

The browser never sees the key.

## Security: treat the Worker URL as a password

`ALLOWED_ORIGINS` in `worker.js` restricts which origins may call the Worker. That stops **other
websites** from using it, because browsers set `Origin` honestly.

It does **not** stop someone holding the URL — a command-line client can forge any `Origin`
header. So anyone with your Worker URL can spend your NVIDIA quota.

- Keep the URL private; do not commit it or post it publicly.
- Edit `ALLOWED_ORIGINS` if you host the page anywhere other than the default GitHub Pages URL.
- For multi-user or shared use, add a token check to the Worker, or put Cloudflare Access in
  front of it.

## Models

Check the current catalogue before hardcoding an id:

```
curl https://integrate.api.nvidia.com/v1/models -H "Authorization: Bearer nvapi-…"
```

The app ships with `z-ai/glm-5.2` (default), `minimaxai/minimax-m3` and
`meta/llama-3.1-70b-instruct`. Edit `NVIDIA_MODELS` in `index.html` to change the list.

## Rotating the key

```
wrangler secret put NVIDIA_KEY     # paste the new key
```

Nothing else changes — same Worker, same URL, same app configuration.

## Does anything need to keep running?

No. The Worker runs on Cloudflare's network. Your computer can be off and your Cloudflare session
logged out; the Worker stays live. You only log in again to redeploy or change the secret.

## Local testing

```
echo 'NVIDIA_KEY=dummy' > .dev.vars     # gitignored
npx wrangler@4 dev --local --port 8791
```

Then check the behaviour without a real key:

```
# allowed origin  -> 204 with access-control-allow-origin
curl -i -X OPTIONS http://127.0.0.1:8791 -H "Origin: https://00timmer.github.io" \
  -H "Access-Control-Request-Method: POST"

# foreign origin   -> 403, never reaches NVIDIA
curl -i -X POST http://127.0.0.1:8791 -H "Origin: https://evil.example.com" \
  -H "Content-Type: application/json" -d '{}'
```

A `401` from a POST with the dummy key is the expected success signal: it means the request
reached NVIDIA and came back **with** CORS headers attached.
