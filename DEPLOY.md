# Deploying

## The Netlify question, up front

The spec asks for Netlify hosting and, in the architecture section, for one
long-lived process that polls every 15 seconds, holds the result in memory and
fans it out over SSE. Those two cannot both be true, so this is worth deciding
deliberately rather than discovering at deploy time.

Netlify Functions are serverless. That means:

- **No process to hold the poller.** A function exists for the length of one
  request. There is nowhere for a 15-second interval to live.
- **Scheduled Functions floor at one minute.** Even used as the poller, the board
  would be up to 60 seconds stale instead of 15.
- **No in-memory cache between invocations.** State has to move to Netlify Blobs
  or similar, adding a read on every request.
- **SSE does not survive.** Function responses are buffered and time-limited, so
  the stream the frontend expects would not stay open.
- **The rate limit becomes hard to honour.** Concurrent cold invocations have no
  shared gate, so "1 request/second globally" stops being enforceable in the way
  `RateGate` enforces it today.

The architecture section is the one the spec flags as mattering ("If you find
yourself adding a request-per-user code path, stop and re-read this"), so this
repo keeps it and treats Netlify as the frontend host.

**If you would rather have Netlify-only**, that is a real option — it costs the
15-second refresh and the push stream. Say so and the poller moves to a Scheduled
Function on a 1-minute cron writing to Netlify Blobs, the SSE route is dropped,
and the frontend polls `/api/airport/:icao/inbound` instead. The domain logic
(`selectInbound`, the taxonomy, the filters) is untouched by that change — it is
all pure functions over a snapshot. Only `src/poller/` and `src/routes/stream.ts`
are affected.

## Option 1 — Netlify for the frontend, a persistent host for the API (recommended)

The frontend is a static bundle, which is exactly what Netlify is good at.

**API** on any host that runs a container or a Node process — Fly.io, Railway,
Render, a VPS:

```bash
npm ci
npm run build
NODE_ENV=production AIRPORTS=CYYZ node server/dist/index.js
```

A `Dockerfile` is included for hosts that want one.

**Frontend** on Netlify. `netlify.toml` is set up already; point the site at this
repo and set one environment variable:

```
VITE_API_BASE = https://your-api-host.example.com
```

Then set `CORS_ORIGINS` on the API to your Netlify origin so the browser is
allowed to open the stream:

```
CORS_ORIGINS=https://your-site.netlify.app
```

Check that the stream survives whatever sits in front of the API. The route
already sends `X-Accel-Buffering: no` and `Cache-Control: no-transform`, which
covers nginx; some CDNs need event-stream buffering turned off explicitly.

## Option 2 — one host, no CORS

The API can serve the built frontend itself, which removes the CORS and
`VITE_API_BASE` steps entirely:

```bash
npm run build
SERVE_STATIC=true node server/dist/index.js
```

Everything is then same-origin on one port. This is the simplest deploy and the
one used to verify the board locally.

## Environment

See `.env.example`. The ones that matter in production:

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `8787` | |
| `AIRPORTS` | `CYYZ` | Comma-separated ICAO codes, all must exist in `server/src/config/airports.ts` |
| `POLL_INTERVAL_MS` | `15000` | Per airport |
| `MIN_REQUEST_SPACING_MS` | `1200` | Global floor between upstream requests. Leave headroom under the published 1 req/s |
| `SEARCH_RADIUS_NM` | `60` | API maximum is 250 |
| `USER_AGENT` | app + repo URL | The aggregators ask for a real one. Keep it honest |
| `CORS_ORIGINS` | empty (allow all) | Set this in production |
| `AERODATABOX_API_KEY` | empty | Optional. Enables the Upcoming board. Server-side only — never put it in the Netlify build |
| `SERVE_STATIC` | `false` | `true` to serve `web/dist` from the API |

## Frontend build variables

These are set in Netlify, not on the API host. Both are baked into the public
bundle at build time, which is fine because neither is secret.

| Variable | Notes |
| --- | --- |
| `VITE_API_BASE` | Absolute API origin. Empty means same origin |
| `VITE_GA_ID` | Google Analytics measurement ID. Unset loads no analytics at all |

Anything genuinely secret — the AeroDataBox key above all — belongs on the API
host. A `VITE_` variable is public the moment the site ships.

## Scaling note

Adding airports costs upstream requests: each one polls on its own interval
through the shared rate gate. At the default 15s interval, roughly 12 airports
saturates the 1 req/s budget. Past that, raise `POLL_INTERVAL_MS` rather than
lowering `MIN_REQUEST_SPACING_MS`.

Adding *users* costs nothing upstream. That is the whole point of the design.
