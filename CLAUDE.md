# Working in this repo

Read [`plane spotter board SPEC.md`](plane%20spotter%20board%20SPEC.md) first. It
holds the decisions; this file holds the things easiest to break.

## Invariants

**The server polls, the browser never does.** One poller per airport, one
in-memory snapshot, fanned out over HTTP and SSE. Adding a fetch on a request
path — per page load, per user, per row — defeats the design and breaks the
upstream rate limit. There is a note about this at the top of
`server/src/poller/poller.ts`.

**One request per second, globally.** Every upstream call goes through the
`RateGate` in `server/src/adsb/client.ts`. It is shared across all pollers. Do not
add a second path to the aggregators.

**Nothing hardcodes YYZ.** Airports come from `server/src/config/airports.ts` and
`AIRPORTS` in the environment. YYZ is the default, not an assumption.

**The taxonomy lives in one file.** `server/src/config/aircraft-types.ts`. The
frontend gets it from `/api/config` and ships no copy — adding a type code should
never require a frontend change.

**Unknown type codes must not break anything.** They go in the `OTHER` bucket
with the raw code visible.

## Commands

```bash
npm run dev      # API on :8787, frontend on :5173 with /api proxied
npm test         # 200 tests, server + web
npm run build    # typecheck both, compile server, bundle frontend
```

`npm run dev` runs both halves under `concurrently --kill-others`, so stopping it
takes the whole tree down. It deliberately does **not** use `npm-run-all`, which
is unmaintained and leaves `tsx watch` and `vite` running on Windows after a
Ctrl+C; those orphans accumulate until a later run dies with
`exited with 3221226505` (`0xC0000409`).

If you hit that, something is still stranded from an earlier run. Find it with
`Get-CimInstance Win32_Process -Filter "Name='node.exe'"` and check the command
lines before killing anything — other projects' dev servers look much the same.

To check the inbound rules against live traffic without a browser:

```bash
cd server && npx tsx scripts/inspect.ts
```

It prints the board and a tally of why every other aircraft was rejected. That
tally is the fastest way to tell a bad rule from a quiet sky.

## Changing the inbound rules

Thresholds are `INBOUND_RULES` in `server/src/domain/inbound.ts`, deliberately in
one object. `judge()` returns a rejection `reason` for every aircraft it drops —
keep that, the inspect script and the tests both depend on it.

Altitude is compared against **field elevation**, not sea level. It matters at
high-elevation airports and there is a test for it.

## Non-goals for v1

Multiple airports on screen at once, accounts, saved filters, notifications,
history, departures, map view. Push back if these arrive before the core board is
solid.

## The Upcoming board and its budget

A fourth upstream, AeroDataBox, supplies today's scheduled arrivals. It is the
only one needing a key, and the only one that is **metered by the month**: 600
units on the free tier, 2 per schedule fetch, so about 300 fetches a month.

That budget is why `SchedulePoller` runs on a three-hour timer rather than a
fifteen-second one, and why `routes/upcoming.ts` only ever reads cache. A fetch
on a request path would burn the month in an afternoon — the same invariant as
the live board, with far less headroom.

**The key is optional.** With `AERODATABOX_API_KEY` unset the schedule poller
never starts, `/api/config` reports `upcomingEnabled: false`, and the frontend
hides the tab. A fresh clone still runs with no signup, which is what the spec
promised.

## The schedule speaks a different language

AeroDataBox reports aircraft as free text — "Boeing 777-300ER", and really
"Canadair reg jet 700" — not as ICAO designators. `schedule/model-codes.ts`
normalises that onto a designator so classification goes through the same
`categoriesFor` the live board uses. The taxonomy stays the one source of truth;
adding a type code is still a one-file change.

First match wins in `MODEL_PATTERNS`, so a specific variant must precede its
family. An unmapped model is reported in `unrecognisedModels` rather than being
silently dropped.
## Upstreams and their gates

Three upstreams, three different services:

- **ADS-B aggregators** (adsb.lol / .fi / .one) — the board itself. One shared
  `RateGate` in `server/src/adsb/client.ts`, one request per second across every
  poller. This is the invariant above; do not add a second path to it.
- **adsbdb.com** — flight routes by callsign. Its own gate in
  `server/src/flightroute/client.ts`. Looked up in the background and cached, so
  the poll never waits on it.
- **planespotters.net** — photos. Cached proxy in `server/src/routes/photos.ts`.

A new upstream gets its own gate. Sharing the aggregators' gate would starve the
board to feed a decoration.

## Route data is approximate

`arrivesHere` on a route is false whenever the scheduled destination is not the
airport being watched, and that is common — the route database stores one
canonical city pair per callsign. Never render a route as "where this aircraft
came from" without checking it. `arrivesAt()` in `server/src/domain/route.ts` is
the single place that decides, and the UI dims and marks the rest.

## Schedule refresh uses a heartbeat, not a long timer

`SchedulePoller` ticks every five minutes and asks a wall-clock question — is the
cache older than the refresh interval? — rather than sleeping on one three-hour
`setTimeout`. A long timer does not survive a laptop suspending: one set before a
sleep simply never fires, and the schedule silently froze for a day while the
board showed an empty Upcoming tab.

The heartbeat costs nothing upstream. Only the answer does.

**A stale cache must never render as "nothing due".** When the cached window no
longer reaches the present, `snapshot()` reports `unavailable` with the age and
the last error; when it is merely ageing, `stale` is set and the UI says so above
the list. "Nothing big is due" and "we could not refresh" look identical to a
spotter otherwise, and only one of them is worth acting on.
