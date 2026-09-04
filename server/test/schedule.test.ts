import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { toTypeCode } from "../src/schedule/model-codes.js";
import { isBigAircraft, normalizeFlight, selectUpcoming, toIso } from "../src/schedule/normalize.js";
import type { RawScheduledFlight } from "../src/schedule/client.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  fs.readFileSync(path.join(here, "fixtures", "schedule-yyz.json"), "utf8"),
) as { arrivals: RawScheduledFlight[] };

describe("toTypeCode", () => {
  it("maps the widebodies a spotter cares about", () => {
    expect(toTypeCode("Airbus A380-800")).toBe("A388");
    expect(toTypeCode("Airbus A350-1000")).toBe("A35K");
    expect(toTypeCode("Airbus A350-900")).toBe("A359");
    expect(toTypeCode("Airbus A330-300")).toBe("A333");
    expect(toTypeCode("Boeing 777-300ER")).toBe("B77W");
    expect(toTypeCode("Boeing 777-200LR")).toBe("B77L");
    expect(toTypeCode("Boeing 787-9")).toBe("B789");
    expect(toTypeCode("Boeing 747-8")).toBe("B748");
    expect(toTypeCode("Boeing 767-300")).toBe("B763");
  });

  it("prefers the specific variant over the family", () => {
    // The 300ER must not be swallowed by the generic 777 rule.
    expect(toTypeCode("Boeing 777-300ER")).toBe("B77W");
    expect(toTypeCode("Boeing 777-300")).toBe("B773");
    expect(toTypeCode("Boeing 787-10")).toBe("B78X");
    expect(toTypeCode("Boeing 787-8")).toBe("B788");
  });

  it("falls back to the commonest member for a bare family", () => {
    expect(toTypeCode("Boeing 777")).toBe("B772");
    expect(toTypeCode("Boeing 787")).toBe("B789");
    expect(toTypeCode("Airbus A330")).toBe("A333");
    expect(toTypeCode("Boeing 747")).toBe("B744");
  });

  it("is case and whitespace insensitive", () => {
    expect(toTypeCode("  boeing 777-300er  ")).toBe("B77W");
    expect(toTypeCode("AIRBUS A350-1000")).toBe("A35K");
  });

  it("copes with the vendor spelling of the CRJs", () => {
    // Their data really does say "Canadair reg jet 700".
    expect(toTypeCode("Canadair reg jet 700")).toBe("CRJ7");
    expect(toTypeCode("Canadair CRJ 900")).toBe("CRJ9");
    expect(toTypeCode("Bombardier CRJ900")).toBe("CRJ9");
  });

  it("passes through a value that is already a designator", () => {
    expect(toTypeCode("BCS3")).toBe("BCS3");
    expect(toTypeCode("E295")).toBe("E295");
  });

  it("returns null for something it does not know", () => {
    expect(toTypeCode("Gulfstream Aerospace G650")).toBeNull();
    expect(toTypeCode("")).toBeNull();
    expect(toTypeCode(null)).toBeNull();
    expect(toTypeCode(undefined)).toBeNull();
  });

  it("maps narrowbodies to narrowbody codes", () => {
    expect(toTypeCode("Airbus A321")).toBe("A321");
    expect(toTypeCode("Airbus A320 NEO")).toBe("A20N");
    expect(toTypeCode("Boeing 737 MAX 8")).toBe("B38M");
    expect(toTypeCode("Embraer 175")).toBe("E75L");
  });
});

describe("toIso", () => {
  it("parses the vendor format, which Date.parse does not accept as-is", () => {
    expect(toIso("2026-09-04 16:00Z")).toBe("2026-09-04T16:00:00.000Z");
  });

  it("returns null rather than an Invalid Date", () => {
    expect(toIso("not a time")).toBeNull();
    expect(toIso(undefined)).toBeNull();
    expect(toIso("")).toBeNull();
  });
});

describe("normalizeFlight", () => {
  const base: RawScheduledFlight = {
    number: "AC 855",
    callSign: "ACA855",
    status: "Expected",
    isCargo: false,
    aircraft: { reg: "C-FIVK", modeS: "C01234", model: "Boeing 777-300ER" },
    airline: { name: "Air Canada", iata: "AC", icao: "ACA" },
    departure: { airport: { icao: "EGLL", iata: "LHR", name: "London Heathrow" } },
    arrival: { scheduledTime: { utc: "2026-09-04 18:55Z" }, terminal: "1", gate: "D28" },
  };

  it("maps a full entry onto our shape", () => {
    const flight = normalizeFlight(base)!;
    expect(flight.number).toBe("AC 855");
    expect(flight.callsign).toBe("ACA855");
    expect(flight.type).toBe("B77W");
    expect(flight.typeName).toBe("Boeing 777-300ER");
    expect(flight.registration).toBe("C-FIVK");
    expect(flight.hex).toBe("c01234");
    expect(flight.origin).toMatchObject({ iata: "LHR", icao: "EGLL" });
    expect(flight.terminal).toBe("1");
    expect(flight.categories).toContain("WIDEBODY");
  });

  it("prefers a revised time and says that it did", () => {
    const flight = normalizeFlight({
      ...base,
      arrival: {
        scheduledTime: { utc: "2026-09-04 18:55Z" },
        revisedTime: { utc: "2026-09-04 19:20Z" },
      },
    })!;
    expect(flight.arrivalTime).toBe("2026-09-04T19:20:00.000Z");
    expect(flight.arrivalIsRevised).toBe(true);
  });

  it("falls back to the scheduled time", () => {
    const flight = normalizeFlight(base)!;
    expect(flight.arrivalTime).toBe("2026-09-04T18:55:00.000Z");
    expect(flight.arrivalIsRevised).toBe(false);
  });

  it("returns null when there is no arrival time to place it on a timeline", () => {
    expect(normalizeFlight({ ...base, arrival: {} })).toBeNull();
    expect(normalizeFlight({ ...base, arrival: undefined })).toBeNull();
  });

  it("keeps the vendor model when the code is unrecognised", () => {
    const flight = normalizeFlight({
      ...base,
      aircraft: { model: "Gulfstream Aerospace G650" },
    })!;
    expect(flight.type).toBeNull();
    expect(flight.typeName).toBeNull();
    expect(flight.model).toBe("Gulfstream Aerospace G650");
    expect(flight.categories).toEqual(["OTHER"]);
  });

  it("survives an entry with no aircraft at all", () => {
    const flight = normalizeFlight({ ...base, aircraft: undefined })!;
    expect(flight.type).toBeNull();
    expect(flight.model).toBeNull();
    expect(flight.categories).toEqual(["OTHER"]);
  });

  it("does not call a passenger 777-200LR a freighter", () => {
    const flight = normalizeFlight({ ...base, aircraft: { model: "Boeing 777-200LR" } })!;
    expect(flight.type).toBe("B77L");
    expect(flight.categories).toContain("WIDEBODY");
    expect(flight.categories).not.toContain("FREIGHTER");
  });
});

describe("isBigAircraft", () => {
  const withCategories = (categories: string[]) =>
    ({ categories }) as unknown as Parameters<typeof isBigAircraft>[0];

  it("accepts the three airframe categories the board is for", () => {
    expect(isBigAircraft(withCategories(["WIDEBODY"]))).toBe(true);
    expect(isBigAircraft(withCategories(["QUAD", "WIDEBODY"]))).toBe(true);
    expect(isBigAircraft(withCategories(["DOUBLE_DECK"]))).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isBigAircraft(withCategories(["OTHER"]))).toBe(false);
    expect(isBigAircraft(withCategories([]))).toBe(false);
    // Freight alone is a role, not an airframe.
    expect(isBigAircraft(withCategories(["FREIGHTER"]))).toBe(false);
  });
});

describe("selectUpcoming", () => {
  const past = new Date("2020-01-01T00:00:00Z");

  it("keeps only double deck, quad and widebody", () => {
    const result = selectUpcoming(fixture.arrivals, { now: past });
    expect(result.flights.length).toBeGreaterThan(0);
    for (const flight of result.flights) {
      const big = flight.categories.some((c) =>
        ["DOUBLE_DECK", "QUAD", "WIDEBODY"].includes(c),
      );
      expect(big, String(flight.number) + " " + String(flight.model)).toBe(true);
    }
  });

  it("drops the narrowbodies that shared the window", () => {
    const result = selectUpcoming(fixture.arrivals, { now: past });
    const models = result.flights.map((f) => f.model ?? "");
    expect(models.some((m) => /737|a320|a321|crj|embraer/i.test(m))).toBe(false);
  });

  it("reports the unfiltered total, so the tab can say what it hid", () => {
    const result = selectUpcoming(fixture.arrivals, { now: past });
    expect(result.totalScheduled).toBe(fixture.arrivals.length);
    expect(result.totalScheduled).toBeGreaterThan(result.flights.length);
  });

  it("sorts by arrival time", () => {
    const times = selectUpcoming(fixture.arrivals, { now: past }).flights.map(
      (f) => f.arrivalTime,
    );
    expect(times).toEqual([...times].sort());
  });

  it("drops flights that have already arrived", () => {
    const future = new Date("2099-01-01T00:00:00Z");
    expect(selectUpcoming(fixture.arrivals, { now: future }).flights).toEqual([]);
  });

  it("surfaces models it could not map rather than hiding them", () => {
    const result = selectUpcoming(
      [
        {
          aircraft: { model: "Something Unheard Of" },
          arrival: { scheduledTime: { utc: "2030-01-01 10:00Z" } },
        },
      ],
      { now: past },
    );
    expect(result.unrecognisedModels).toEqual(["Something Unheard Of"]);
  });

  it("does not throw on junk", () => {
    expect(() => selectUpcoming(undefined)).not.toThrow();
    expect(() => selectUpcoming([])).not.toThrow();
    expect(() => selectUpcoming([{}, { aircraft: {} }])).not.toThrow();
    expect(selectUpcoming([{}]).flights).toEqual([]);
  });
});
