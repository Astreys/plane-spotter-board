import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAircraft } from "../src/flightroute/client.js";
import { AircraftResolver } from "../src/flightroute/aircraft.js";

/**
 * Both fixtures are real adsbdb responses, kept verbatim. The Porter one shows
 * the registration quirk that decided how the poller uses this: adsbdb returned
 * "CA-GKQL" for an aircraft whose registration is C-GKQL, so the feed's own
 * registration always wins when there is one.
 */
const porter = {
  response: {
    aircraft: {
      type: "ERJ 190-400",
      icao_type: "E295",
      manufacturer: "Embraer",
      mode_s: "C060BC",
      registration: "CA-GKQL",
      registered_owner_country_iso_name: "CA",
      registered_owner_country_name: "Canada",
      registered_owner_operator_flag_code: null,
      registered_owner: "Porter Airlines (Canada) Limited",
      url_photo: null,
      url_photo_thumbnail: null,
    },
  },
};

const turkish = {
  response: {
    aircraft: {
      type: "A321 271NXSL",
      icao_type: "A21N",
      manufacturer: "Airbus",
      mode_s: "4BB279",
      registration: "TC-LSY",
      registered_owner_country_iso_name: "TR",
      registered_owner_country_name: "Turkey",
      registered_owner_operator_flag_code: "THY",
      registered_owner: "Turkish Airlines",
      url_photo: null,
      url_photo_thumbnail: null,
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

describe("fetchAircraft", () => {
  it("maps a hit onto our own shape", async () => {
    stubFetch(() => jsonResponse(turkish));
    const result = await fetchAircraft("4bb279");

    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.aircraft).toEqual({
      type: "A21N",
      model: "A321 271NXSL",
      manufacturer: "Airbus",
      registration: "TC-LSY",
      operator: "Turkish Airlines",
      operatorIcao: "THY",
    });
  });

  it("keeps an operator that has no airline code", async () => {
    stubFetch(() => jsonResponse(porter));
    const result = await fetchAircraft("c060bc");

    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.aircraft.operator).toBe("Porter Airlines (Canada) Limited");
    expect(result.aircraft.operatorIcao).toBeNull();
    expect(result.aircraft.type).toBe("E295");
  });

  it('reads the "unknown aircraft" string body as a settled miss', async () => {
    stubFetch(() => jsonResponse({ response: "unknown aircraft" }, 404));
    expect(await fetchAircraft("a1b2c3")).toEqual({ status: "unknown" });
  });

  it("treats 404 and 400 as answers, not failures", async () => {
    stubFetch(() => new Response("", { status: 404 }));
    expect((await fetchAircraft("abcdef")).status).toBe("unknown");

    stubFetch(() => new Response("", { status: 400 }));
    expect((await fetchAircraft("abcdef")).status).toBe("unknown");
  });

  it("reports a server error as retryable rather than as a miss", async () => {
    stubFetch(() => new Response("", { status: 503 }));
    expect((await fetchAircraft("4bb279")).status).toBe("error");
  });

  it("never throws when the network does", async () => {
    stubFetch(() => {
      throw new Error("ECONNRESET");
    });
    expect(await fetchAircraft("4bb279")).toEqual({ status: "error", message: "ECONNRESET" });
  });

  it("does not spend a request on something that is not a Mode S address", async () => {
    const spy = stubFetch(() => jsonResponse(turkish));
    expect(await fetchAircraft("N12345")).toEqual({ status: "unknown" });
    expect(await fetchAircraft("")).toEqual({ status: "unknown" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("survives a record with nothing useful in it", async () => {
    stubFetch(() => jsonResponse({ response: { aircraft: {} } }));
    expect((await fetchAircraft("4bb279")).status).toBe("unknown");
  });
});

describe("AircraftResolver", () => {
  const record = {
    type: "A21N",
    model: "A321 271NXSL",
    manufacturer: "Airbus",
    registration: "TC-LSY",
    operator: "Turkish Airlines",
    operatorIcao: "THY",
  };

  /** The lookup is injected, so these test caching and queueing, not HTTP. */
  const found = () => vi.fn(async () => ({ status: "found", aircraft: record }) as const);
  const unknown = () => vi.fn(async () => ({ status: "unknown" }) as const);
  const failing = () => vi.fn(async () => ({ status: "error", message: "HTTP 503" }) as const);

  /** Let the background drain finish. */
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  };

  it("knows nothing until a lookup lands, and never blocks the caller", async () => {
    const lookup = found();
    const resolver = new AircraftResolver(undefined, lookup);

    expect(resolver.get("4bb279")).toBeNull();
    resolver.ensure(["4bb279"]);
    // Still null on this tick — the point is that ensure() returned immediately.
    expect(resolver.get("4bb279")).toBeNull();

    await settle();
    expect(resolver.get("4bb279")?.operator).toBe("Turkish Airlines");
  });

  it("asks about an aircraft only once", async () => {
    const lookup = found();
    const resolver = new AircraftResolver(undefined, lookup);

    resolver.ensure(["4bb279"]);
    await settle();
    resolver.ensure(["4bb279"]);
    resolver.ensure(["4BB279"]);
    await settle();

    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("caches a miss so the same unknown airframe is not asked about every poll", async () => {
    const lookup = unknown();
    const resolver = new AircraftResolver(undefined, lookup);

    resolver.ensure(["a1b2c3"]);
    await settle();
    resolver.ensure(["a1b2c3"]);
    await settle();

    expect(lookup).toHaveBeenCalledTimes(1);
    expect(resolver.get("a1b2c3")).toBeNull();
  });

  it("leaves an errored lookup uncached so the next poll retries", async () => {
    const lookup = failing();
    const resolver = new AircraftResolver(undefined, lookup);

    resolver.ensure(["4bb279"]);
    await settle();
    resolver.ensure(["4bb279"]);
    await settle();

    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("is case and whitespace insensitive", async () => {
    const resolver = new AircraftResolver(undefined, found());

    resolver.ensure([" 4BB279 "]);
    await settle();

    expect(resolver.get("4bb279")?.type).toBe("A21N");
    expect(resolver.get("4BB279")?.type).toBe("A21N");
  });

  it("ignores null and blank addresses", async () => {
    const lookup = found();
    const resolver = new AircraftResolver(undefined, lookup);

    resolver.ensure([null, "", "   "]);
    await settle();

    expect(lookup).not.toHaveBeenCalled();
    expect(resolver.get(null)).toBeNull();
  });

  it("keeps working when one lookup in a batch fails", async () => {
    const lookup = vi.fn(async (hex: string) =>
      hex === "badbad"
        ? ({ status: "error", message: "boom" } as const)
        : ({ status: "found", aircraft: record } as const),
    );
    const resolver = new AircraftResolver(undefined, lookup);

    resolver.ensure(["badbad", "4bb279"]);
    await settle();

    expect(lookup).toHaveBeenCalledTimes(2);
    expect(resolver.get("4bb279")?.type).toBe("A21N");
  });

  it("stops looking things up once stopped", async () => {
    const lookup = found();
    const resolver = new AircraftResolver(undefined, lookup);

    resolver.stop();
    resolver.ensure(["4bb279"]);
    await settle();

    expect(lookup).not.toHaveBeenCalled();
    expect(resolver.stats().queued).toBe(0);
  });
});
