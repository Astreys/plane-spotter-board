import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findAirport } from "../src/config/airports.js";
import { fetchMetars, type RawMetar } from "../src/weather/client.js";
import { WeatherPoller } from "../src/weather/poller.js";

/**
 * The rule these guard is the one CLAUDE.md states for the schedule: old data must
 * never render as current. METAR makes it easy to get wrong, because a fetch one
 * minute ago can still return a report from an hour ago, and a station that stops
 * reporting keeps returning its last one forever.
 */

// The gate spaces real requests two seconds apart. These tests move the clock
// around, so let every task straight through rather than sleep on it.
vi.mock("../src/util/rate-gate.js", () => ({
  RateGate: class {
    run<T>(task: () => Promise<T>): Promise<T> {
      return task();
    }
  },
}));

const reports = JSON.parse(
  fs.readFileSync(new URL("./fixtures/metar-sample.json", import.meta.url), "utf8"),
) as RawMetar[];

const AIRPORTS = ["CYYZ", "KJFK", "EGLL"].map((code) => findAirport(code)!);
const log = { info: () => {}, warn: () => {} };
const MINUTE = 60_000;

/** When Pearson's report in the fixture was observed. Every test counts from here. */
const YYZ_OBSERVED = reports.find((entry) => entry.icaoId === "CYYZ")!.obsTime! * 1000;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetch(handler: () => Response) {
  const spy = vi.fn(async (_input: string | URL, _init?: RequestInit) => handler());
  vi.stubGlobal("fetch", spy);
  return spy;
}

/** Drive one heartbeat by hand, as the interval would. */
const tick = (poller: WeatherPoller): Promise<void> =>
  (poller as unknown as { tick(): Promise<void> }).tick();

function at(ms: number): void {
  vi.setSystemTime(new Date(ms));
}

beforeEach(() => {
  // Only Date: the poller's own interval is never started here.
  vi.useFakeTimers({ toFake: ["Date"] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchMetars", () => {
  it("asks for every airport in one request, and says who is asking", async () => {
    const spy = stubFetch(() => jsonResponse(reports));
    await fetchMetars(["CYYZ", "KJFK", "EGLL"]);

    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).toContain("aviationweather.gov/api/data/metar");
    expect(String(url)).toContain("ids=CYYZ,KJFK,EGLL");
    expect((init?.headers as Record<string, string>)["User-Agent"]).toMatch(/plane-spotter-board/);
  });

  it("treats 204 as an answer with nothing in it", async () => {
    stubFetch(() => new Response(null, { status: 204 }));
    expect(await fetchMetars(["CYYZ"])).toEqual({ status: "ok", reports: [] });
  });

  it("says plainly when it has been rate limited", async () => {
    stubFetch(() => new Response("", { status: 429 }));
    expect(await fetchMetars(["CYYZ"])).toEqual({
      status: "error",
      message: "HTTP 429 (rate limited)",
    });
  });

  it("turns a network failure into a value instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("getaddrinfo ENOTFOUND");
      }),
    );
    expect(await fetchMetars(["CYYZ"])).toEqual({ status: "error", message: "getaddrinfo ENOTFOUND" });
  });

  it("rejects a body that is not a list of reports", async () => {
    stubFetch(() => jsonResponse({ error: "nope" }));
    expect((await fetchMetars(["CYYZ"])).status).toBe("error");
  });
});

describe("WeatherPoller", () => {
  it("says loading, not unavailable-for-good, before its first fetch", () => {
    const snapshot = new WeatherPoller(AIRPORTS, log).snapshot("CYYZ")!;
    expect(snapshot.loading).toBe(true);
    expect(snapshot.observation).toBeNull();
    expect(snapshot.error).toBeNull();
  });

  it("serves a recent report as current weather", async () => {
    stubFetch(() => jsonResponse(reports));
    const poller = new WeatherPoller(AIRPORTS, log);
    at(YYZ_OBSERVED + 20 * MINUTE);
    await tick(poller);

    const snapshot = poller.snapshot("CYYZ")!;
    expect(snapshot.observation?.condition).toBe("Mostly clear");
    expect(snapshot.ageSeconds).toBe(20 * 60);
    expect(snapshot.stale).toBe(false);
    expect(snapshot.unavailable).toBe(false);
    // 08:20 in Toronto in September.
    expect(snapshot.observation?.isDay).toBe(true);
  });

  it("counts age from the observation, not from the fetch", async () => {
    stubFetch(() => jsonResponse(reports));
    const poller = new WeatherPoller(AIRPORTS, log);
    // Fetched just now, but the report itself is 70 minutes old.
    at(YYZ_OBSERVED + 70 * MINUTE);
    await tick(poller);

    expect(poller.snapshot("CYYZ")!.ageSeconds).toBe(70 * 60);
  });

  it("marks a report stale once an hourly one has been missed", async () => {
    stubFetch(() => jsonResponse(reports));
    const poller = new WeatherPoller(AIRPORTS, log);
    at(YYZ_OBSERVED + 5 * MINUTE);
    await tick(poller);

    at(YYZ_OBSERVED + 2 * 60 * MINUTE);
    const snapshot = poller.snapshot("CYYZ")!;
    expect(snapshot.stale).toBe(true);
    // Still shown - it is old, not wrong - but the card will say so.
    expect(snapshot.observation).not.toBeNull();
  });

  it("stops presenting weather as current once it is hours old", async () => {
    stubFetch(() => jsonResponse(reports));
    const poller = new WeatherPoller(AIRPORTS, log);
    at(YYZ_OBSERVED + 5 * MINUTE);
    await tick(poller);

    at(YYZ_OBSERVED + 3.5 * 60 * MINUTE);
    const snapshot = poller.snapshot("CYYZ")!;
    expect(snapshot.unavailable).toBe(true);
    expect(snapshot.observation).toBeNull();
    expect(snapshot.ageSeconds).toBe(3.5 * 60 * 60);
    expect(snapshot.error).toMatch(/too old/);
  });

  it("keeps the last good report through a failed refresh, and flags it", async () => {
    const responses = [jsonResponse(reports), new Response("", { status: 500 })];
    stubFetch(() => responses.shift()!);
    const poller = new WeatherPoller(AIRPORTS, log);

    at(YYZ_OBSERVED + 5 * MINUTE);
    await tick(poller);
    at(YYZ_OBSERVED + 16 * MINUTE);
    await tick(poller);

    const snapshot = poller.snapshot("CYYZ")!;
    expect(snapshot.observation).not.toBeNull();
    expect(snapshot.error).toBe("HTTP 500");
    expect(snapshot.stale).toBe(true);
  });

  it("does not refetch before the refresh interval", async () => {
    const spy = stubFetch(() => jsonResponse(reports));
    const poller = new WeatherPoller(AIRPORTS, log);

    at(YYZ_OBSERVED);
    await tick(poller);
    at(YYZ_OBSERVED + 5 * MINUTE);
    await tick(poller);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("backs off after a failure instead of retrying every heartbeat", async () => {
    const spy = stubFetch(() => new Response("", { status: 503 }));
    const poller = new WeatherPoller(AIRPORTS, log);

    at(YYZ_OBSERVED);
    await tick(poller);
    at(YYZ_OBSERVED + 1 * MINUTE);
    await tick(poller);
    expect(spy).toHaveBeenCalledTimes(1);

    at(YYZ_OBSERVED + 2 * MINUTE);
    await tick(poller);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("says so when a station sent nothing, rather than showing blank weather", async () => {
    stubFetch(() => new Response(null, { status: 204 }));
    const poller = new WeatherPoller(AIRPORTS, log);
    at(YYZ_OBSERVED);
    await tick(poller);

    const snapshot = poller.snapshot("CYYZ")!;
    expect(snapshot.loading).toBe(false);
    expect(snapshot.unavailable).toBe(true);
    expect(snapshot.error).toMatch(/no recent report/);
  });

  it("ignores reports for stations it was not asked about", async () => {
    // The fixture also holds Oslo, Amsterdam and others; none are tracked here.
    stubFetch(() => jsonResponse(reports));
    const poller = new WeatherPoller(AIRPORTS, log);
    at(YYZ_OBSERVED);
    await tick(poller);

    expect(poller.stats().stations).toBe(3);
    expect(poller.snapshot("ENGM")).toBeUndefined();
  });
});
