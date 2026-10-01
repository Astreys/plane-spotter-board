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
npm test         # 381 tests, server + web
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

## The layout ladder

The frontend is one responsive shell, not a mobile build and a desktop build.
Every component is shared; a CSS grid re-flows it. The widths live in
`--shell-max` / `--shell-gutter` / `--shell-gap` in `web/src/styles/main.css`
and each breakpoint adds exactly one thing:

| width      | what appears                                  |
| ---------- | --------------------------------------------- |
| base       | one column, the phone board                   |
| `47.5rem`  | wider column, masthead becomes a proper band  |
| `65rem`    | the card rail, and the board becomes a card   |
| `80rem`    | the nav rail, which replaces the tab strip    |

Anything that has to line up with the board - the masthead, the footer - reads
`--shell-max` rather than repeating a number. Hardcoding a width is how the
masthead stops aligning with the list under it.

**Mobile stays the primary target.** The spec's user is standing at a fence with
one hand on a camera; desktop is the enhancement layer. Side cards and the nav
rail are desktop-only for that reason, and anything that costs the mobile list
vertical space needs a reason.

**This is not an airport's own site.** The footer disclaimer says so and stays
visible at every width. No airport branding, no airline logos - we have no
licensed source for airline marks, so `PopularAirlines` uses coloured monograms.

Hero artwork is generated from the ICAO code by `AirportHero.vue` until there is
real art. Dropping in a real image is one field: set `heroImage` on the airport
in `server/src/config/airports.ts` and it flows through `/api/config`.

## The board filter is not a flight search

The spec rules out flight search, and the filter box keeps to that: `search.ts`
only narrows the aircraft or scheduled arrivals already on screen, the way the
chips do, and never asks the server for anything. It cannot find a flight the
board is not already showing.

**It only matches what a row can vouch for.** A route that does not end here has
its city name hidden, so the filter must not find a row by that city either —
codes yes, names only when `arrivesHere`. Keep `inboundHaystack()` in step with
what `AircraftRow.vue` is willing to show.

**It exists only at desktop widths**, and `activeQuery` in `App.vue` is empty
whenever the box is hidden. Hiding the box with CSS alone would leave a query
typed on a wide window still filtering the list after it narrows, with nothing on
screen to explain the missing rows. `useMediaQuery` is what lets the filter
switch off with the box.

## Which way the airport is landing

Nobody publishes the runway in use for free, but it is written in the sky: an
aircraft a minute from touchdown is lined up on the centreline, so its ground
track *is* the landing direction. `domain/flow.ts` reads it off the board.

**Headings in `config/runways.ts` are true, not magnetic.** Runway numbers are
magnetic heading over ten, and Toronto's variation is about 10 degrees, so a
table in the wrong frame is out by a whole designation. ADS-B reports track
relative to true north, so the two compare directly. Pearson's 05, 06L and 06R
all share a true heading of 047 — they are parallel, and the numbers only differ
because variation drifted between the decades they were named. One direction,
labelled "05/06", because a spotter stands in one place for all three.

**Aircraft close to landing settle it.** Those further out are consulted only
when none are close, since they may still be turning onto the approach.

**The alignment tolerance is tight (15 degrees) on purpose.** Runway directions
sit about 90 degrees apart, so a loose tolerance makes half the compass count as
"lined up": at 25 degrees an aircraft mid-vector on 336 was read as landing on
Pearson's 33 (317 true).

**Nothing is inferred from wind.** Wind says what an airport would prefer; noise
rules and traffic routinely override it, and a guess dressed as an observation is
worse than silence.

**Null renders as silence.** At 3am with one helicopter about, the direction is
not knowable, and sending someone to the wrong side of an airport is worse than
telling them nothing. `FlowTracker` keeps the answer steady — a new direction must
survive consecutive polls before it is adopted, and a quiet spell holds the last
one for ten minutes rather than blinking out.

An airport in `airports.ts` with no entry in `runways.ts` simply never reports a
direction.

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

## Live board and schedule scale differently

`AIRPORTS` chooses what is polled live; `SCHEDULE_AIRPORTS` chooses which of those
also get an Upcoming board. They are separate on purpose. The aggregators are
free and shared across airports, so tracking several live costs nothing extra
beyond the shared rate gate. A schedule costs metered units per airport, so five
schedules would need five times the monthly budget.

The frontend follows: `/api/config` reports `hasSchedule` per airport, and the
Upcoming tab only appears for airports that have one.

## The schedule fetches on demand

`SchedulePoller` does not fetch on boot. The route calls `markRequested()`, the
poller fetches in the background, and an airport goes quiet again once nobody has
opened its Upcoming tab for six hours. An airport nobody looks at costs nothing,
which is what makes adding more of them affordable.

The request path still never fetches - it only records interest. A first view
returns `loading: true` and the data lands a second or two later; the frontend
polls briefly to cover that, reading cache each time.

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

Each upstream is a different service with its own limits:

- **ADS-B aggregators** (adsb.lol / .fi / .one) — the board itself. One shared
  `RateGate` in `server/src/adsb/client.ts`, one request per second across every
  poller. This is the invariant above; do not add a second path to it.
- **adsbdb.com** — two endpoints, one gate in `server/src/flightroute/client.ts`:
  routes by callsign, and airframes by Mode S address. Both are looked up in the
  background and cached, so the poll never waits on either. One service, one
  budget; do not give the aircraft endpoint a gate of its own.
- **planespotters.net** — photos. Cached proxy in `server/src/routes/photos.ts`.
- **aviationweather.gov** - METAR for the weather card. Its own gate in
  `server/src/weather/client.ts`; one request covers every airport, every ten
  minutes. `weather/metar.ts` is the one place that turns METAR codes into words,
  the way `schedule/model-codes.ts` does for aircraft names.

**Weather age comes from the observation, not the fetch.** Stations report hourly,
so a fetch a minute ago can return a report from fifty minutes ago, and a station
that stops reporting keeps returning its last one. Past 90 minutes the snapshot is
`stale` and the card says so; past three hours `observation` is null and the card
shows no weather rather than old weather as current - the same rule as the
schedule's.

A new upstream gets its own gate. Sharing the aggregators' gate would starve the
board to feed a decoration.

## Airline identity comes from two places

A row learns its airline from the route lookup (the callsign's trading name) or
from the airframe's registered operator, and `identityOf()` in
`web/src/airlines.ts` is the single place that decides between them. The route
name wins for display because the registry holds legal names — "Porter Airlines
(Canada) Limited" — which `tidyOperator()` trims.

The airframe lookup matters because most general aviation has no resolvable
callsign, so the operator is the only name that will ever arrive.

**The airframe also fills in a missing type.** The feed omits the type code often
enough to matter, and a row without one sits in `OTHER` reading "Unknown type".
When adsbdb supplies one the poller re-runs `categoriesFor`, so it classifies
through the same taxonomy as everything else.

**The feed's registration always wins.** adsbdb returns "CA-GKQL" for aircraft
registered C-GKQL, so its registration is only a fallback.

Enrichment is attached during a poll, so it only appears on a *successful* poll.
While the aggregators are failing, the board keeps serving its last snapshot and
no new names attach — which is correct, but worth remembering when a board looks
oddly anonymous.

## Route data is approximate

`arrivesHere` on a route is false whenever the scheduled destination is not the
airport being watched, and that is common — the route database stores one
canonical city pair per callsign. Never render a route as "where this aircraft
came from" without checking it. `arrivesAt()` in `server/src/domain/route.ts` is
the single place that decides, and the UI dims and marks the rest.

**The schedule outranks the callsign.** Where an airport has an Upcoming board,
`SchedulePoller.originFor()` gives today's actual origin by callsign or Mode S
address, and `withScheduledOrigin()` replaces the canonical pair with it.
`route.source` says which you are looking at: `"schedule"` is this arrival,
`"callsign"` is the flight number's usual leg. The index covers **every**
scheduled arrival, not just the big ones the board lists — correcting a
narrowbody matters just as much, and it is the same response, already paid for.

**A callsign match alone is not proof.** Light aircraft do transmit airline
callsigns — a Cessna 172 squawking ACA427 appeared on the board the day this was
written — so a callsign match is refused when the schedule names a different Mode
S address for that flight. The address wins, because it identifies the airframe.

The case that prompted it: adsbdb returns Montréal → New York for ACA744, which
that day flew San Francisco → Toronto.

**Only a route that ends here may show a city name.** A pair we cannot vouch for
keeps its dimmed codes and its `SCHEDULED` mark but loses the friendly name —
"Montréal" reads as a fact in a way "YUL" does not. Airports with no schedule
key, and aircraft outside the schedule window, stay in that quieter mode.

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
