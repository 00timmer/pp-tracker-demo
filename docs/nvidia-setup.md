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

## Security model

**The API key is never exposed.** It lives in the Cloudflare secret store and is attached
server-side. No amount of poking at the page or the Worker reveals it. That property holds no
matter who calls the Worker.

**The Worker URL is public**, because the app ships with a default proxy and a static page cannot
keep a secret. Two things bound the consequences:

- `ALLOWED_ORIGINS` rejects calls from other websites — browsers set `Origin` honestly, so this
  stops a different site embedding your proxy. It does *not* stop a client that forges the header.
- A per-IP **rate limit of 20 requests/minute** (the `RATE_LIMITER` binding in `wrangler.toml`)
  caps what any single caller can consume. Verified: 30 concurrent requests → 5 served, 25 got
  `429`.

So the realistic worst case is a stranger consuming some of your NVIDIA quota, not a stolen
credential. On a free-tier NVIDIA key that means the app stops answering until the quota resets.

**Do not put a billed NVIDIA key behind a public default proxy.** If the key has real spend
attached, either remove the default from `index.html` and have users paste their own proxy URL, or
put a token check or Cloudflare Access in front of the Worker.


## Models

Check the current catalogue before hardcoding an id:

```
curl https://integrate.api.nvidia.com/v1/models -H "Authorization: Bearer nvapi-…"
```

The app ships with `z-ai/glm-5.2` (default), `minimaxai/minimax-m3` and
`meta/llama-3.1-70b-instruct`. Edit `NVIDIA_MODELS` in `index.html` to change the list.

### Measured speed

Same prompt, `max_tokens:150`, `temperature:0`, ~29 completion tokens, five runs per model.
Median rather than mean, because the outliers are large.

| Model | Median | Range | Success |
|---|---|---|---|
| **`z-ai/glm-5.2`** | **3.05s** | 1.1–5.8s | 5/5 |
| `minimaxai/minimax-m3` | ~2.6s (2 samples) | 0.6–4.5s | 2/5, then 0/6 |
| `meta/llama-3.1-70b-instruct` | 10.98s | 3.6–122s | 4/5 |

GLM 5.2 is the default because it never failed and had the tightest spread.

`minimaxai/minimax-m3` looks quick in the samples that completed, but it is **throttled**, not
fast: six consecutive `429 Too Many Requests` at 15-second spacing. Those come back in NVIDIA's
error shape (`{"status":429,…}`), not the Worker's rate limit (`{"error":"Rate limit reached…"}`),
so the ceiling is upstream. Expect it to be unavailable on the free tier.

`meta/llama-3.1-70b-instruct` had two runs over 120 seconds — cold starts on shared capacity — so
its median understates how bad the tail is.

Small samples on shared free-tier capacity; absolute numbers will drift with load, though the
ordering held across every round.

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
