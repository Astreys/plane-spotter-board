import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRoute } from "../src/flightroute/client.js";
import { RouteResolver } from "../src/flightroute/resolver.js";

/** A hit, shaped exactly like adsbdb's real response. */
const hit = {
  response: {
    flightroute: {
      callsign: "WJA709",
      callsign_iata: "WS709",
      airline: { name: "WestJet", icao: "WJA", iata: "WS" },
      origin: {
        country_iso_name: "CA",
        iata_code: "YYZ",
        icao_code: "CYYZ",
        municipality: "Toronto",
        name: "Lester B. Pearson International Airport",
      },
      destination: {
        country_iso_name: "CA",
        iata_code: "YVR",
        icao_code: "CYVR",
        municipality: "Vancouver",
        name: "Vancouver International Airport",
      },
    },
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetch(handler: (url: string) => Response | Promise<Response>) {
  const spy = vi.fn(async (input: string | URL) => handler(String(input)));
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchRoute", () => {
  it("maps a hit onto our own shape", async () => {
    stubFetch(() => jsonResponse(hit));
    const result = await fetchRoute("WJA709");

    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.route.origin).toMatchObject({ iata: "YYZ", icao: "CYYZ", city: "Toronto" });
    expect(result.route.destination).toMatchObject({ iata: "YVR", city: "Vancouver" });
    expect(result.route.airline).toBe("WestJet");
    expect(result.route.airlineIcao).toBe("WJA");
    expect(result.route.airlineIata).toBe("WS");
    expect(result.route.callsignIata).toBe("WS709");
    // Only the poller knows the airport, so the client never claims this.
    expect(result.route.arrivesHere).toBe(false);
  });

  it('reads the "unknown callsign" string body as a settled miss', async () => {
    stubFetch(() => jsonResponse({ response: "unknown callsign" }, 404));
    expect(await fetchRoute("CGQYT")).toEqual({ status: "unknown" });
  });

  it("treats 404 and 400 as answers, not failures", async () => {
    stubFetch(() => new Response("", { status: 404 }));
    expect((await fetchRoute("ABC123")).status).toBe("unknown");

    stubFetch(() => new Response("", { status: 400 }));
    expect((await fetchRoute("ABC124")).status).toBe("unknown");
  });

  it("reports a server error as retryable rather than as a miss", async () => {
    stubFetch(() => new Response("", { status: 503 }));
    const result = await fetchRoute("ACA123");
    expect(result.status).toBe("error");
  });

  it("never throws when the network does", async () => {
    stubFetch(() => {
      throw new Error("ECONNRESET");
    });
    const result = await fetchRoute("ACA123");
    expect(result).toEqual({ status: "error", message: "ECONNRESET" });
  });

  it("does not spend a request on an implausible callsign", async () => {
    const spy = stubFetch(() => jsonResponse(hit));
    expect(await fetchRoute("!!")).toEqual({ status: "unknown" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("survives a route with no usable airport codes", async () => {
    stubFetch(() =>
      jsonResponse({ response: { flightroute: { origin: {}, destination: {} } } }),
    );
    expect((await fetchRoute("ACA999")).status).toBe("unknown");
  });
});

describe("RouteResolver", () => {
  const route = {
    origin: { iata: "YYZ", icao: "CYYZ", name: null, city: "Toronto", countryIso: "CA" },
    destination: { iata: "YVR", icao: "CYVR", name: null, city: "Vancouver", countryIso: "CA" },
    airline: "WestJet",
    callsignIata: "WS709",
    airlineIcao: "WJA",
    airlineIata: "WS",
    arrivesHere: false,
  };

  /** The lookup is injected, so these test caching and queueing, not HTTP. */
  const found = () => vi.fn(async () => ({ status: "found", route }) as const);
  const unknown = () => vi.fn(async () => ({ status: "unknown" }) as const);
  const failing = () => vi.fn(async () => ({ status: "error", message: "HTTP 503" }) as const);

  /** Let the background drain finish. */
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  };

  it("knows nothing until a lookup lands, and never blocks the caller", async () => {
    const lookup = found();
    const resolver = new RouteResolver(undefined, lookup);

    expect(resolver.get("WJA709")).toBeNull();
    resolver.ensure(["WJA709"]);
    // Still null on this tick — the point is that ensure() returned immediately.
    expect(resolver.get("WJA709")).toBeNull();

    await settle();
    expect(resolver.get("WJA709")?.origin?.iata).toBe("YYZ");
  });

  it("asks about a callsign only once", async () => {
    const lookup = found();
    const resolver = new RouteResolver(undefined, lookup);

    resolver.ensure(["WJA709"]);
    await settle();
    resolver.ensure(["WJA709"]);
    resolver.ensure(["WJA709"]);
    await settle();

    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("does not queue the same callsign twice before the first lands", async () => {
    const lookup = found();
    const resolver = new RouteResolver(undefined, lookup);

    resolver.ensure(["WJA709", "WJA709", "wja709"]);
    await settle();

    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("caches a miss so general aviation is not asked about every poll", async () => {
    const lookup = unknown();
    const resolver = new RouteResolver(undefined, lookup);

    resolver.ensure(["CGQYT"]);
    await settle();
    resolver.ensure(["CGQYT"]);
    await settle();

    expect(lookup).toHaveBeenCalledTimes(1);
    expect(resolver.get("CGQYT")).toBeNull();
  });

  it("leaves an errored lookup uncached so the next poll retries", async () => {
    const lookup = failing();
    const resolver = new RouteResolver(undefined, lookup);

    resolver.ensure(["ACA123"]);
    await settle();
    resolver.ensure(["ACA123"]);
    await settle();

    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("ignores null and blank callsigns", async () => {
    const lookup = found();
    const resolver = new RouteResolver(undefined, lookup);

    resolver.ensure([null, "", "   "]);
    await settle();

    expect(lookup).not.toHaveBeenCalled();
    expect(resolver.get(null)).toBeNull();
  });

  it("is case and whitespace insensitive", async () => {
    const resolver = new RouteResolver(undefined, found());

    resolver.ensure([" wja709 "]);
    await settle();

    expect(resolver.get("WJA709")?.destination?.iata).toBe("YVR");
    expect(resolver.get("wja709")?.destination?.iata).toBe("YVR");
  });

  it("keeps working when one lookup in a batch fails", async () => {
    const lookup = vi.fn(async (callsign: string) =>
      callsign === "BAD1"
        ? ({ status: "error", message: "boom" } as const)
        : ({ status: "found", route } as const),
    );
    const resolver = new RouteResolver(undefined, lookup);

    resolver.ensure(["BAD1", "WJA709"]);
    await settle();

    expect(lookup).toHaveBeenCalledTimes(2);
    expect(resolver.get("WJA709")?.origin?.iata).toBe("YYZ");
  });

  it("stops looking things up once stopped", async () => {
    const lookup = found();
    const resolver = new RouteResolver(undefined, lookup);

    resolver.stop();
    resolver.ensure(["WJA709"]);
    await settle();

    expect(lookup).not.toHaveBeenCalled();
    expect(resolver.stats()).toEqual({ cached: 0, queued: 0 });
  });
});
