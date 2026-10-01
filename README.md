# Plane Spotter Board

A live board of aircraft inbound to an airport, built to answer one question:
**is something worth driving to the fence for in the next 30 minutes?**

Not a flight tracker, not a booking tool. One airport, one list, filterable by
airframe — quads, double deckers, widebodies, freighters, whatever is rare.

See [`plane spotter board SPEC.md`](plane%20spotter%20board%20SPEC.md) for the
decisions behind it. Read it before changing anything; update it when a decision
changes.

## Running it

```bash
npm install
npm run dev
```

That starts the API on `http://127.0.0.1:8787` and the frontend on
`http://127.0.0.1:5173`, with `/api` proxied so everything is same-origin.

First data lands within a poll interval (15s). `npm run dev:server` and
`npm run dev:web` run the halves separately.

```bash
npm test        # 360 tests across server and web
npm run build   # typecheck both, compile the server, bundle the frontend
```

## How it works

**The server polls. The browser never touches the ADS-B API.**

```
poller (15s) ──> in-memory cache ──> HTTP / SSE ──> browsers
```

One poller per tracked airport, sharing a single global rate gate so that no
matter how many airports are tracked, upstream never sees more than one request
per 1.2 seconds. Every connected browser reads the same cached snapshot. Ten
users or ten thousand, it stays one request per 15 seconds per airport.

Nothing on a request path fetches from upstream. If you are about to add that,
read the note at the top of [`server/src/poller/poller.ts`](server/src/poller/poller.ts).

Data comes from the community ADS-B aggregators (adsb.lol, with adsb.fi and
adsb.one as fallbacks). On failure the poller rotates hosts, then backs off
exponentially while serving the last good snapshot with `stale: true` and an age.

## Layout

```
server/
  src/config/aircraft-types.ts   the taxonomy — the file you will edit most
  src/config/airports.ts         airport registry (nothing hardcodes YYZ)
  src/adsb/client.ts             host rotation + the global rate gate
  src/domain/inbound.ts          "is it landing here" — the part worth getting right
  src/domain/filters.ts          OR within a group, AND across groups
  src/poller/                    one poller per airport, the only upstream caller
  src/weather/                   METAR: its client, the code-to-words translation, one poller
  src/routes/                    inbound, SSE stream, config, photos, health
  scripts/inspect.ts             print the board + rejection reasons in a terminal
web/
  src/App.vue                    the board
  src/composables/useBoard.ts    SSE subscription, age clock, filter state
```

## API

| Route | Purpose |
| --- | --- |
| `GET /api/airport/:icao/inbound` | Current board as JSON. `?categories=WIDEBODY,FREIGHTER`, `?within=30` |
| `GET /api/airport/:icao/stream` | Same payload pushed over SSE on every poll |
| `GET /api/airport/:icao/upcoming` | Todays scheduled big arrivals; empty when no key is set |
| `GET /api/airport/:icao/weather` | Latest METAR for the field, in plain words; `observation: null` once it is too old to show |
| `GET /api/config` | Airports, category chips, detection thresholds, attribution |
| `GET /api/photo/:hex` | Cached planespotters.net lookup; `photo: null` on any miss |
| `GET /api/health` | Per-poller freshness; 503 until the first snapshot lands |

`:icao` accepts ICAO or IATA — `CYYZ` and `YYZ` both work.

## Inbound detection

An aircraft makes the board when it is below ~13,000 ft above field elevation,
within 50 nm, descending (or already below 6,000 ft), tracking within 60° of the
airport, and its position fix is under 60 seconds old. Departures climbing out
and anything on the ground are excluded.

Minutes out is distance over ground speed with a small pad for deceleration. It
is an estimate and the UI says so. The thresholds live in one place,
`INBOUND_RULES` in [`server/src/domain/inbound.ts`](server/src/domain/inbound.ts).

To check the rules against reality without a browser:

```bash
cd server
npx tsx scripts/inspect.ts                        # live pull for CYYZ
npx tsx scripts/inspect.ts test/fixtures/yyz-live.json
AIRPORT=CYVR npx tsx scripts/inspect.ts
```

It prints the board plus a tally of why everything else was rejected, which is
how you tell "the rules are wrong" from "nothing is landing".

## Upcoming big aircraft

A second tab lists todays scheduled arrivals, filtered to double deck, quad and
widebody only. It answers the question the live board cannot: is anything worth
coming out for later today?

Schedules come from [AeroDataBox](https://www.aerodatabox.com), which is the only
upstream needing a key, and the only one metered by the month. Set
`AERODATABOX_API_KEY` in `server/.env` to switch it on.

**It is optional.** Without a key the schedule poller never starts, `/api/config`
reports `upcomingEnabled: false`, and the tab is hidden. The live board is
unaffected, so a fresh clone still runs with no signup.

Budget shapes the design: the free tier gives 600 units a month and one fetch
costs 2, so roughly 300 fetches. The server refreshes on a three-hour timer and
every browser reads that cache - a fetch per request would exhaust the month in
an afternoon.

The vendor reports aircraft as free text rather than ICAO designators, so
[`schedule/model-codes.ts`](server/src/schedule/model-codes.ts) normalises the
model onto a designator and classification then runs through the same taxonomy
the live board uses. Models it cannot place are reported in `unrecognisedModels`
rather than dropped.

Times are the operator schedule, not observation. A revision is only marked when
it actually moves the time.

## Weather

The weather card reads the field's own METAR from
[aviationweather.gov](https://aviationweather.gov): free, no key, and on by default
(`WEATHER_ENABLED=false` hides it). One request every ten minutes covers every
tracked airport, and [`weather/metar.ts`](server/src/weather/metar.ts) turns the
codes into words - `SCT` into "Partly cloudy", `VCSH` into "Showers nearby".

METAR has no humidity, so it is derived from temperature and dewpoint. The card
shows the wind's direction, not just its speed, because that decides which runway
is in use and so which end of the field to stand at.

Stations report hourly, so the card always says how old its report is. Past 90
minutes it is marked stale; past three hours the card shows nothing rather than
presenting old weather as current.

## Where a flight came from

The ADS-B feed carries no route — it knows a callsign, not a city pair. Routes
come from [adsbdb.com](https://www.adsbdb.com), looked up by callsign, cached in
memory, and fetched **in the background**: the poller attaches whatever is already
cached and never waits, so a newly seen aircraft gains its route on the next tick
rather than delaying the board. adsbdb is a separate service from the aggregators
and holds its own rate gate, so it never spends their one-request-per-second
budget.

**Treat the route as the flight number's scheduled city pair, not as where this
aircraft just came from.** The database stores one canonical pair per callsign,
and airlines reuse a number across different pairs on different days. Sampled
against YYZ short-final traffic, the stored destination frequently was not YYZ —
including a WestJet at 475 ft on 1.5 nm final whose stored route read
`YXX → YYC`.

So the board shows the pair but never asserts it. When the scheduled destination
is not the airport being watched, the row dims the route and marks it
`SCHEDULED`. `arrivesAt()` in
[`server/src/domain/route.ts`](server/src/domain/route.ts) is the one place that
decides this, and it is unit tested.

### What the airframe adds

adsbdb also knows the airframe behind a Mode S address, and
[`flightroute/aircraft.ts`](server/src/flightroute/aircraft.ts) caches that the
same way: same service, same gate, same rule that a poll never waits on it.

It fills two gaps. The feed often omits the type code, and a row without one sat
in `OTHER` reading "Unknown type" even when it was a widebody — with a type from
adsbdb it classifies through the same taxonomy as everything else. And it names
the registered operator, so an aircraft whose callsign never resolves, which is
most general aviation, still says who is flying it.

Airline logos are trademarks with no licensed source available to a project like
this, so an airline is shown as a coloured monogram. `AirlineMark.vue` is the one
component that decides that, and it already accepts a logo URL, so a licensed
source would be a one-component change.

### When the schedule knows better

A route from adsbdb is the flight number's canonical city pair, and airlines reuse
numbers across different legs. ACA744 is stored as Montréal → New York; on the day
this was written it flew San Francisco → Toronto.

Where an airport has an Upcoming board, the schedule we already fetch is indexed
by callsign and Mode S address — for every arrival, not just the widebodies the
board lists — and that origin replaces the canonical pair. A match on the callsign
alone is refused when the schedule expects a different Mode S address: light
aircraft do transmit airline callsigns, and a Cessna 172 squawking ACA427 turned
up on the board while this was being written. `route.source` then
reads `schedule` rather than `callsign`, and the row can say where the aircraft
actually came from.

Without a schedule key, or for an aircraft outside its window, the row keeps the
stored pair but shows only dimmed codes and a `SCHEDULED` mark, with no city
name: "Montréal" reads as a fact in a way "YUL" does not.

## Filters

Categories are defined once, in
[`server/src/config/aircraft-types.ts`](server/src/config/aircraft-types.ts), and
served to the frontend from `/api/config` — the browser ships no copy of the
taxonomy, so adding a type code needs no frontend change.

Filtering is **OR within a group, AND across groups**: `Double deck + Quad` shows
either; `Widebody + Freighter` shows only aircraft that are both.

Unknown type codes are never dropped. They land in **Other** with the raw code
visible, so they can be classified later.

### The filter box

On a desktop-width window a filter box sits under the board's heading. It narrows
the aircraft or scheduled arrivals already on screen by flight number, callsign,
airline, type, registration or origin — every word must match, accents are
ignored, and "AC744" finds "AC 744". Press `/` to focus it and Escape to clear it.

It is a filter, not a flight search: it never asks the server for anything, so it
cannot find a flight the board is not already showing. It is not shown on phones,
where boards are short and the chips already narrow them.

## Attribution and terms

Non-commercial use only. The UI credits the aggregators, planespotters.net and aviationweather.gov,
and the server sends an identifying `User-Agent`. Keep both if you fork this.

Arrival estimates are not a schedule and this is not for navigation.

## Deploying

See [DEPLOY.md](DEPLOY.md) — including why the API is not itself on Netlify, and
what it would cost to put it there.

## Running the API from your own machine

The frontend lives on Netlify; the API runs wherever you point it. Right now that
is a laptop, reached over a Tailscale Funnel. Here is the whole loop after a
reboot.

### After restarting the computer

**1. Make sure Tailscale is actually connected.**

```bash
tailscale status
```

If it says `Tailscale is starting. Please wait.` or `NoState`, the Windows
service is running but the tray app is not. **Launch Tailscale from the Start
menu** — the GUI owns the connection state, and restarting the service alone will
not fix it. This is the single most likely thing to be wrong.

**2. Check the funnel survived.** The serve config is stored, so it usually comes
back on its own:

```bash
tailscale funnel status
```

Expect `https://spotter.tail649e75.ts.net` proxying to `127.0.0.1:8787`. If it is
empty, re-open it:

```bash
tailscale funnel --bg 8787
```

**3. Start the API.**

```bash
npm run build          # only needed after pulling changes
npm start              # compiled server, no file watching
```

`npm start` is the right thing for serving. `npm run dev` also works and adds the
local frontend on :5173, which you do not need when the real one is on Netlify.

**4. Confirm it is reachable from outside**, not just locally — the whole point
is that it works from a phone on mobile data:

```bash
curl https://spotter.tail649e75.ts.net/api/health
```

### What breaks, and why

| Symptom | Cause | Fix |
| --- | --- | --- |
| Board shows "Could not reach the board API" | Laptop asleep, Tailscale down, or API not started | Work through the four steps above |
| `tailscale status` stuck at `NoState` | Tray app not running | Launch Tailscale from the Start menu |
| `npm run dev` fails with exit 127 | `package.json` changed and dependencies are stale | `npm install` |
| Upcoming tab says "Schedule out of date" | Schedule refresh failing, or the laptop slept through it | It self-heals within ~5 minutes of the API running again |
| Upcoming tab empty but live board fine | Genuinely no widebodies due, or the AeroDataBox key is missing | Check `/api/airport/CYYZ/upcoming` for `unavailable` |

### Things worth remembering

**The board is only up while the laptop is.** Close the lid and the site goes to
its error state. That is expected for now; moving the API to a hosted container
is the fix when it matters.

**The AeroDataBox quota is monthly and small.** 600 units, 2 per schedule fetch,
so about 300 fetches. Restarting the API often costs units — each start fetches
once. `/api/health` reports what is left.

**`server/.env` is gitignored and holds the API key.** It does not travel with the
repo, so a fresh clone needs it recreated. Without it everything still runs; the
Upcoming tab simply hides.

**Funnel puts port 8787 on the public internet.** Only that port, only that
process, and the API is read-only — but the URL is genuinely reachable by anyone
who has it.
