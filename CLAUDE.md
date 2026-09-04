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
npm test         # 129 tests, server + web
npm run build    # typecheck both, compile server, bundle frontend
```

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
