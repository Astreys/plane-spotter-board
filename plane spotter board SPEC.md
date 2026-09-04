# Plane Spotter Board — Project Spec

Read this file before making changes. Update it when decisions change.

## What we're building

A web app for plane spotters. Pick an airport (starting with YYZ / Toronto Pearson),
see a live board of aircraft inbound and about to land, filterable by airframe
category — quads, double-deckers, widebodies, specific types.

The point is: "is something worth driving to the fence for, in the next 30 minutes."
Not a booking tool, not a flight search, not a general flight tracker.

## Data source

Community ADS-B aggregators. Free, no API key, no signup.

Primary: `https://api.adsb.lol`
Fallbacks (identical schema, ADSBExchange v2 compatible):
`https://api.adsb.fi`, `https://api.adsb.one`

Endpoint we care about:

```
GET /v2/point/{lat}/{lon}/{radius_nm}
```

Radius max 250 nm. Rate limit **1 request/second** — treat this as hard.

Response shape:

```json
{
  "ac": [
    {
      "hex": "c06a1b",
      "flight": "ACA123  ",
      "r": "C-FIVR",
      "t": "B77W",
      "alt_baro": 12000,
      "gs": 280.5,
      "track": 245.1,
      "baro_rate": -1600,
      "lat": 43.91,
      "lon": -78.92,
      "seen_pos": 1.2
    }
  ],
  "now": 1675633671226,
  "total": 1
}
```

Notes on fields:
- `t` is the ICAO type code (`A388`, `B77W`, `B748`). This is our filter key.
- `flight` is the callsign, **space-padded** — always trim it.
- `alt_baro` can be the string `"ground"` instead of a number. Handle it.
- `baro_rate` is ft/min, negative = descending. May be absent.
- Point queries usually return `dst` (nm from query point) and `dir` (bearing).
  Compute them ourselves as a fallback — don't assume they're there.
- Any field can be missing. Never index blindly.

### Amendment: the Upcoming board needs a key

The no-key rule above holds for the live board and still does. It cannot hold for
a schedule: ADS-B knows what is airborne now and never what is booked for later,
and every schedule API requires a key. Verified in September 2026 - adsbdb has no
airport endpoint, adsb.lol returns airport metadata only, and AeroDataBox 401s
without a key.

So the Upcoming board uses AeroDataBox on its free tier, and the key is optional:
without it the schedule poller never starts and the tab hides, leaving the live
board exactly as specified here. Nothing in this document is weakened for anyone
who does not set one.

Terms: non-commercial use only. Add visible attribution to the data source in the UI.
Send a real `User-Agent` identifying the app.

## Architecture — this part matters

**The server polls. The browser never touches the ADS-B API.**

One background poller per tracked airport, one request every 15 seconds, result held
in memory. All connected clients read from that cache. Ten users or ten thousand,
it's still 1 request per 15s.

```
poller (15s) ──> in-memory cache ──> HTTP endpoint / SSE ──> browsers
```

Do not fetch from client-side JS. Do not fetch per page load. Do not fetch per user.
If you find yourself adding a request-per-user code path, stop and re-read this.

Poller requirements:
- Sequential, never concurrent, across all airports (respect 1 req/s globally).
- On failure, rotate to the next host in the fallback list.
- On repeated failure, exponential backoff, serve stale cache with an `age` field.
- Never crash the process on a bad response. Log and keep the last good snapshot.

## "Landing soon" logic

An aircraft qualifies as inbound when all of:
- `alt_baro` is a number below ~13,000 ft
- distance from airport under ~50 nm
- descending (`baro_rate < -200`) OR already below 6,000 ft
- heading roughly toward the airport — angle between `track` and the bearing from
  the aircraft to the airport is under ~60°
- `seen_pos` under 60 (position isn't stale)

Estimate minutes out from ground speed and distance. It's rough, that's fine —
label it as an estimate in the UI. Don't over-engineer this.

Exclude anything on the ground. Exclude aircraft climbing out (departures will
otherwise show up on the wrong side of the field).

## Filter categories

An aircraft can belong to several categories at once. Filters are OR within a
group, AND across groups.

```
DOUBLE_DECK  A388, B741, B742, B743, B744, B748, B74R, B74S, BLCF
QUAD         A388, A342, A343, A345, A346, B741..B748, IL96, A124, C5M
WIDEBODY     everything in QUAD, plus:
             A332, A333, A338, A339, A359, A35K,
             B762, B763, B764, B772, B773, B77L, B77W, B77F,
             B788, B789, B78X, A306, A30B, A310, MD11
FREIGHTER    B77F, B74S, MD11, BLCF, A124  (also flag by callsign/operator)
RARE         a hand-maintained list — A388, B748, A124, MD11, IL96, A345, A346
```

Keep this in one config file (`src/config/aircraft-types.ts` or equivalent),
not scattered through components. It will get edited often.

Unknown type codes must not break anything — show them in an "Other" bucket with
the raw code visible so we can classify them later.

## GitHub

https://github.com/Astreys/plane-spotter-board

## Stack

- TypeScript throughout.
- Node backend. Fastify or Express, whichever is simpler — this is one poller and
  two endpoints, don't reach for a framework with opinions. Or something that 
  fits better netlify, because going to host it on netlify
- SSE for pushing updates to the browser. WebSockets are overkill; it's one-way.
- Frontend: Vue with typescript + Vite. Plain CSS or Tailwind, no component library.
- No database in v1. In-memory cache is enough. Persistence is a later decision.

## UI

Mobile-first. This gets used standing in a field with one hand on a camera.

- Big list, one row per aircraft: type code, airline/callsign, registration,
  altitude, minutes out.
- Filter chips along the top, tappable, state visible at a glance.
- Aircraft photo per row is a nice-to-have — planespotters.net has a free
  non-commercial API keyed by hex or registration. Lazy load, cache hard,
  don't block the row on it.
- Auto-refresh with a visible "last updated Xs ago" indicator.
- Empty state should say something useful: "nothing widebody inbound in the next
  30 min" beats a blank screen.

## Non-goals for v1

- Multiple airports at once (build for one, but don't hardcode YYZ — config it)
- User accounts, saved filters, notifications
- Historical data or statistics
- Departures
- Map view

Push back if asked to add these before the core board works.

## Milestones

1. Poller + cache + a `/api/airport/:icao/inbound` endpoint returning JSON.
   Verify against YYZ by eye — do the results match what's actually landing?
2. Filter logic + type taxonomy, unit tested with fixture snapshots.
3. Frontend board with SSE and filter chips.
4. Photos, polish, attribution, deploy.

Ship 1 and verify it before touching the frontend. The whole project is worthless
if the inbound detection is wrong, and that's the part hardest to eyeball later.

## Reference

YYZ: 43.6777, -79.6248
