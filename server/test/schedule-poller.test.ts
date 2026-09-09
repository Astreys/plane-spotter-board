import { describe, expect, it, vi, afterEach } from "vitest";
import { findAirport } from "../src/config/airports.js";
import { SchedulePoller } from "../src/schedule/poller.js";

/**
 * The bug these cover: the tab showed "Nothing big due" while real widebodies
 * were landing, because a day-old cache had every flight in the past and nothing
 * said the data was stale.
 */

const YYZ = findAirport("CYYZ")!;
const log = { info: () => {}, warn: () => {} };

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Reach into the private cache the way a long-running process would fill it. */
function seed(
  poller: SchedulePoller,
  options: { fetchedAt: number; coversUntil: number; arrivalTimes: string[] },
) {
  (poller as unknown as { cache: unknown }).cache = {
    flights: options.arrivalTimes.map((arrivalTime, i) => ({
      number: "AC " + i,
      callsign: "ACA" + i,
      airline: "Air Canada",
      status: "Expected",
      isCargo: false,
      type: "B77W",
      model: "Boeing 777-300ER",
      typeName: "Boeing 777-300ER",
      registration: null,
      hex: null,
      origin: null,
      arrivalTime,
      arrivalIsRevised: false,
      terminal: null,
      gate: null,
      categories: ["WIDEBODY"],
    })),
    totalScheduled: 400,
    unrecognisedModels: [],
    fetchedAt: options.fetchedAt,
    coversUntil: options.coversUntil,
    unitsRemaining: 500,
  };
}

describe("SchedulePoller.snapshot", () => {
  it("reports unavailable before anything has been fetched", () => {
    const snap = new SchedulePoller(YYZ, log).snapshot();
    expect(snap.unavailable).toBe(true);
    expect(snap.stale).toBe(true);
    expect(snap.flights).toEqual([]);
  });

  it("serves a fresh cache without any staleness flags", () => {
    const poller = new SchedulePoller(YYZ, log);
    const now = Date.now();
    seed(poller, {
      fetchedAt: now - 60_000,
      coversUntil: now + 11 * 3_600_000,
      arrivalTimes: [new Date(now + 40 * 60_000).toISOString()],
    });

    const snap = poller.snapshot();
    expect(snap.unavailable).toBe(false);
    expect(snap.stale).toBe(false);
    expect(snap.flights).toHaveLength(1);
  });

  it("drops arrivals that have already landed but keeps the rest", () => {
    const poller = new SchedulePoller(YYZ, log);
    const now = Date.now();
    seed(poller, {
      fetchedAt: now - 2 * 3_600_000,
      coversUntil: now + 9 * 3_600_000,
      arrivalTimes: [
        new Date(now - 30 * 60_000).toISOString(),
        new Date(now + 30 * 60_000).toISOString(),
      ],
    });

    const snap = poller.snapshot();
    expect(snap.flights).toHaveLength(1);
    expect(snap.unavailable).toBe(false);
  });

  it("calls an expired window unavailable rather than an empty schedule", () => {
    const poller = new SchedulePoller(YYZ, log);
    const now = Date.now();
    // Fetched 31 hours ago; its 12-hour window ran out long before now.
    seed(poller, {
      fetchedAt: now - 31 * 3_600_000,
      coversUntil: now - 19 * 3_600_000,
      arrivalTimes: [new Date(now - 20 * 3_600_000).toISOString()],
    });

    const snap = poller.snapshot();
    // This is the whole point: not an empty list, an admission.
    expect(snap.unavailable).toBe(true);
    expect(snap.stale).toBe(true);
    expect(snap.flights).toEqual([]);
    expect(snap.error).toBeTruthy();
    expect(snap.updatedAt).toBeGreaterThan(0);
  });

  it("marks a cache older than the refresh interval as stale but still serves it", () => {
    const poller = new SchedulePoller(YYZ, log);
    const now = Date.now();
    seed(poller, {
      fetchedAt: now - 5 * 3_600_000,
      coversUntil: now + 2 * 3_600_000,
      arrivalTimes: [new Date(now + 60 * 60_000).toISOString()],
    });

    const snap = poller.snapshot();
    expect(snap.stale).toBe(true);
    expect(snap.unavailable).toBe(false);
    expect(snap.flights).toHaveLength(1);
  });
});

describe("markRequested", () => {
  it("records interest so the next heartbeat will fetch", () => {
    const poller = new SchedulePoller(YYZ, log);
    const due = (p: SchedulePoller) =>
      (p as unknown as { fetchDue: (n: number) => boolean }).fetchDue(Date.now());

    expect(due(poller), "nothing wanted yet").toBe(false);
    poller.markRequested();
    expect(due(poller), "wanted now").toBe(true);
  });

  it("does nothing when the schedule is not configured", () => {
    const poller = new SchedulePoller(YYZ, log);
    poller.stop();
    poller.markRequested();
    expect(poller.snapshot().flights).toEqual([]);
  });
});

describe("SchedulePoller loading state", () => {
  it("reports loading, not out of date, on a first view", () => {
    const poller = new SchedulePoller(YYZ, log);
    poller.markRequested();

    const snap = poller.snapshot();
    expect(snap.updatedAt).toBe(0);
    expect(snap.unavailable).toBe(true);
    // The distinction the UI needs: nothing yet is not the same as stale data.
    expect(snap.loading).toBe(true);
  });

  it("is not loading when nobody has asked", () => {
    expect(new SchedulePoller(YYZ, log).snapshot().loading).toBe(false);
  });
});

describe("SchedulePoller refresh timing", () => {
  const due = (poller: SchedulePoller, now: number): boolean =>
    (poller as unknown as { fetchDue: (n: number) => boolean }).fetchDue(now);

  const setFailures = (poller: SchedulePoller, failures: number, lastAttemptAt: number) => {
    Object.assign(poller as unknown as Record<string, unknown>, {
      consecutiveFailures: failures,
      lastAttemptAt,
    });
  };

  /** Fetching is demand-driven, so timing tests have to register interest first. */
  const wanted = (poller: SchedulePoller, at = Date.now()) => {
    Object.assign(poller as unknown as Record<string, unknown>, { lastRequestedAt: at });
    return poller;
  };

  it("fetches immediately when wanted and there is no cache", () => {
    expect(due(wanted(new SchedulePoller(YYZ, log)), Date.now())).toBe(true);
  });

  it("fetches nothing at all until someone asks", () => {
    // The whole point of lazy: an airport nobody opens costs no units.
    expect(due(new SchedulePoller(YYZ, log), Date.now())).toBe(false);
  });

  it("stops refreshing once nobody has looked for a long while", () => {
    const poller = new SchedulePoller(YYZ, log);
    const now = Date.now();
    seed(poller, { fetchedAt: now - 5 * 3_600_000, coversUntil: now + 3_600_000, arrivalTimes: [] });
    // Last viewed a week ago: let it go quiet rather than spend units forever.
    wanted(poller, now - 7 * 24 * 3_600_000);
    expect(due(poller, now)).toBe(false);
  });

  it("does not refetch a cache younger than the refresh interval", () => {
    const poller = wanted(new SchedulePoller(YYZ, log));
    const now = Date.now();
    seed(poller, { fetchedAt: now - 60_000, coversUntil: now + 3_600_000, arrivalTimes: [] });
    expect(due(poller, now)).toBe(false);
  });

  it("refetches once the cache passes the refresh interval", () => {
    const poller = wanted(new SchedulePoller(YYZ, log));
    const now = Date.now();
    seed(poller, {
      fetchedAt: now - 4 * 3_600_000,
      coversUntil: now + 3_600_000,
      arrivalTimes: [],
    });
    expect(due(poller, now)).toBe(true);
  });

  it("refetches on resume when a machine slept through the interval", () => {
    const poller = wanted(new SchedulePoller(YYZ, log));
    const now = Date.now();
    // A whole day passed with no timer firing. Wall clock, not timers, decides.
    seed(poller, {
      fetchedAt: now - 25 * 3_600_000,
      coversUntil: now - 13 * 3_600_000,
      arrivalTimes: [],
    });
    expect(due(poller, now)).toBe(true);
  });

  it("backs off after a failure, and grows the wait", () => {
    const poller = wanted(new SchedulePoller(YYZ, log));
    const now = Date.now();

    setFailures(poller, 1, now - 60_000);
    expect(due(poller, now), "one minute after the first failure").toBe(false);

    setFailures(poller, 1, now - 11 * 60_000);
    expect(due(poller, now), "eleven minutes after the first failure").toBe(true);

    // Second failure waits longer than the first.
    setFailures(poller, 2, now - 11 * 60_000);
    expect(due(poller, now), "eleven minutes after the second failure").toBe(false);
  });

  it("never backs off beyond the normal refresh interval", () => {
    const poller = wanted(new SchedulePoller(YYZ, log));
    const now = Date.now();
    // The old code capped backoff below the base interval, which made the cap
    // meaningless. Many failures must still retry at least once per interval.
    setFailures(poller, 20, now - 3 * 3_600_000);
    expect(due(poller, now)).toBe(true);
  });
});
