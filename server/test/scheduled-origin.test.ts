import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { findAirport } from "../src/config/airports.js";
import { withScheduledOrigin } from "../src/domain/route.js";
import { SchedulePoller } from "../src/schedule/poller.js";
import { callsignKey, hexKey, selectUpcoming } from "../src/schedule/normalize.js";
import type { RawScheduledFlight } from "../src/schedule/client.js";

/**
 * The bug these cover, found on a real board: adsbdb returns Montréal → New York
 * for ACA744, because it stores one canonical city pair per flight number. That
 * day the aircraft had flown San Francisco → Toronto. The airport's own schedule
 * knew the real origin all along — we had simply thrown it away, keeping only the
 * widebodies the Upcoming board lists.
 */

const YYZ = findAirport("CYYZ")!;
const log = { info: () => {}, warn: () => {} };

const fixture = JSON.parse(
  fs.readFileSync(new URL("./fixtures/schedule-yyz.json", import.meta.url), "utf8"),
) as { arrivals?: RawScheduledFlight[] };

const arrivals = fixture.arrivals ?? [];

/** ACA744 as it really was: an A320 from San Francisco, not a widebody. */
const aca744: RawScheduledFlight = {
  number: "AC 744",
  callSign: "ACA744",
  status: "Expected",
  aircraft: { model: "Airbus A320", reg: "C-GJVT", modeS: "C05EA2" },
  airline: { name: "Air Canada", iata: "AC", icao: "ACA" },
  departure: { airport: { iata: "SFO", icao: "KSFO", name: "San Francisco" } },
  arrival: { scheduledTime: { utc: new Date(Date.now() + 30 * 60_000).toISOString() } },
};

describe("the origins index", () => {
  it("keeps an origin for every arrival, not just the ones the board lists", () => {
    const result = selectUpcoming(arrivals);

    // The board itself only lists big metal...
    expect(result.flights.length).toBeLessThan(arrivals.length);
    // ...but the index covers everything the schedule returned.
    const withOrigin = arrivals.filter(
      (f) => f.departure?.airport?.iata || f.departure?.airport?.icao,
    );
    expect(result.origins.size).toBeGreaterThanOrEqual(withOrigin.length);
  });

  it("indexes a narrowbody the board would never show", () => {
    const result = selectUpcoming([aca744]);

    expect(result.flights).toHaveLength(0);
    expect(result.origins.get(callsignKey("ACA744"))).toEqual({
      iata: "SFO",
      icao: "KSFO",
      name: "San Francisco",
      number: "AC 744",
      hex: "c05ea2",
    });
  });

  it("indexes by Mode S address as well as callsign", () => {
    const result = selectUpcoming([aca744]);
    expect(result.origins.get(hexKey("C05EA2"))?.iata).toBe("SFO");
    expect(result.origins.get(hexKey("c05ea2"))?.iata).toBe("SFO");
  });

  it("skips an arrival whose origin has no codes at all", () => {
    const nameless: RawScheduledFlight = {
      ...aca744,
      departure: { airport: { name: "Somewhere" } },
    };
    expect(selectUpcoming([nameless]).origins.size).toBe(0);
  });
});

describe("SchedulePoller.originFor", () => {
  /** Fill the cache the way a fetch would. */
  function seed(poller: SchedulePoller, coversUntil: number) {
    const selected = selectUpcoming([aca744]);
    (poller as unknown as { cache: unknown }).cache = {
      flights: selected.flights,
      origins: selected.origins,
      totalScheduled: 1,
      unrecognisedModels: [],
      fetchedAt: Date.now(),
      coversUntil,
      unitsRemaining: 500,
    };
  }

  it("answers by callsign and by hex", () => {
    const poller = new SchedulePoller(YYZ, log);
    seed(poller, Date.now() + 6 * 3_600_000);

    expect(poller.originFor("ACA744", null)?.iata).toBe("SFO");
    expect(poller.originFor(null, "c05ea2")?.iata).toBe("SFO");
  });

  it("prefers the airframe over the callsign", () => {
    // The hex identifies the aircraft itself, so it survives a callsign the feed
    // spells differently.
    const poller = new SchedulePoller(YYZ, log);
    seed(poller, Date.now() + 6 * 3_600_000);
    expect(poller.originFor("SOMETHINGELSE", "c05ea2")?.iata).toBe("SFO");
  });

  it("says nothing once its window no longer reaches the present", () => {
    // Yesterday's origin is precisely the wrong answer here.
    const poller = new SchedulePoller(YYZ, log);
    seed(poller, Date.now() - 60_000);
    expect(poller.originFor("ACA744", "c05ea2")).toBeNull();
  });

  it("says nothing before anything has been fetched", () => {
    expect(new SchedulePoller(YYZ, log).originFor("ACA744", "c05ea2")).toBeNull();
  });

  it("refuses a callsign match that names a different airframe", () => {
    /*
     * Seen live: a Cessna 172 transmitting ACA427. Matching on the callsign alone
     * would have given a light aircraft the real Air Canada flight's origin.
     */
    const poller = new SchedulePoller(YYZ, log);
    seed(poller, Date.now() + 6 * 3_600_000);

    expect(poller.originFor("ACA744", "abc123")).toBeNull();
    // Still fine when the feed gives us no address to contradict it with.
    expect(poller.originFor("ACA744", null)?.iata).toBe("SFO");
  });

  it("does not invent an origin for a flight it has never heard of", () => {
    const poller = new SchedulePoller(YYZ, log);
    seed(poller, Date.now() + 6 * 3_600_000);
    expect(poller.originFor("XYZ123", "abcdef")).toBeNull();
  });
});

describe("withScheduledOrigin", () => {
  const canonical = {
    // What adsbdb actually returns for ACA744.
    origin: { iata: null, icao: null, name: null, city: "Montréal", countryIso: "CA" },
    destination: { iata: null, icao: null, name: null, city: "New York", countryIso: "US" },
    airline: "Air Canada",
    callsignIata: "AC744",
    airlineIcao: "ACA",
    airlineIata: "AC",
    source: "callsign" as const,
    arrivesHere: false,
  };

  const scheduled = {
    iata: "SFO",
    icao: "KSFO",
    name: "San Francisco",
    number: "AC 744",
    hex: "c05ea2",
  };

  it("replaces the canonical pair with today's leg", () => {
    const route = withScheduledOrigin(canonical, scheduled, YYZ);

    expect(route.origin?.iata).toBe("SFO");
    expect(route.destination?.iata).toBe("YYZ");
    expect(route.source).toBe("schedule");
    // It is this airport's own schedule entry, so it certainly arrives here.
    expect(route.arrivesHere).toBe(true);
  });

  it("keeps what the callsign lookup knew about the operator", () => {
    const route = withScheduledOrigin(canonical, scheduled, YYZ);
    expect(route.airline).toBe("Air Canada");
    expect(route.airlineIcao).toBe("ACA");
  });

  it("works when there was no route at all to correct", () => {
    const route = withScheduledOrigin(null, scheduled, YYZ);
    expect(route.origin?.iata).toBe("SFO");
    expect(route.arrivesHere).toBe(true);
    expect(route.airline).toBeNull();
  });
});
