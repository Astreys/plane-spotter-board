import { describe, expect, it } from "vitest";
import { hueFor, identityOf, initialsFor, tallyAirlines, tidyOperator } from "../src/airlines";
import type { InboundAircraft, FlightRoute } from "../src/api";

function route(airline: string | null, icao: string | null = null): FlightRoute {
  return {
    origin: null,
    destination: null,
    airline,
    callsignIata: null,
    airlineIcao: icao,
    airlineIata: null,
    arrivesHere: true,
  };
}

function aircraft(
  hex: string,
  options: {
    airline?: string | null;
    airlineIcao?: string | null;
    operator?: string | null;
    operatorIcao?: string | null;
    noRoute?: boolean;
  } = {},
): InboundAircraft {
  return {
    hex,
    callsign: null,
    registration: null,
    type: null,
    typeName: null,
    altitudeFt: 5000,
    groundSpeedKt: 250,
    verticalRateFpm: -800,
    trackDeg: 60,
    lat: 43.4,
    lon: -79.9,
    distanceNm: 20,
    bearingFromAirportDeg: 240,
    fromDirection: "SW",
    minutesOut: 6,
    categories: [],
    route: options.noRoute
      ? null
      : route(options.airline ?? null, options.airlineIcao ?? null),
    operator: options.operator ?? null,
    operatorIcao: options.operatorIcao ?? null,
    seenPosSec: 1,
  };
}

describe("tidyOperator", () => {
  it("strips the corporate tail from a registry name", () => {
    expect(tidyOperator("Porter Airlines (Canada) Limited")).toBe("Porter Airlines");
    expect(tidyOperator("Delta Air Lines, Inc.")).toBe("Delta Air Lines");
    expect(tidyOperator("Lufthansa Cargo AG")).toBe("Lufthansa Cargo");
  });

  it("leaves an already-clean name alone", () => {
    expect(tidyOperator("Air Canada")).toBe("Air Canada");
  });

  it("never strips a name down to nothing", () => {
    expect(tidyOperator("Limited")).toBe("Limited");
  });
});

describe("identityOf", () => {
  it("prefers the route's trading name over the registry's legal one", () => {
    const identity = identityOf(
      aircraft("a", { airline: "Porter Airlines", operator: "Porter Airlines (Canada) Limited" }),
    );
    expect(identity).toEqual({ name: "Porter Airlines", code: null });
  });

  it("names an airline from the airframe when the callsign never resolved", () => {
    // This is the case the card used to report as "not yet identified".
    const identity = identityOf(
      aircraft("b", { noRoute: true, operator: "Turkish Airlines", operatorIcao: "THY" }),
    );
    expect(identity).toEqual({ name: "Turkish Airlines", code: "THY" });
  });

  it("takes the code from the route when the airframe has none", () => {
    const identity = identityOf(aircraft("c", { airline: "Air Canada", airlineIcao: "ACA" }));
    expect(identity).toEqual({ name: "Air Canada", code: "ACA" });
  });

  it("is null when neither lookup has landed", () => {
    expect(identityOf(aircraft("d", { noRoute: true }))).toBeNull();
  });
});

describe("initialsFor", () => {
  it("takes one letter per word for a multi-word name", () => {
    expect(initialsFor("Air Canada")).toBe("AC");
    expect(initialsFor("Cathay Pacific")).toBe("CP");
  });

  it("takes the first two letters of a single word", () => {
    expect(initialsFor("Ethiopian")).toBe("ET");
    expect(initialsFor("EgyptAir")).toBe("EG");
  });

  it("treats a hyphen as a word break", () => {
    expect(initialsFor("Jet-Blue")).toBe("JB");
  });

  it("survives a name that is only whitespace", () => {
    expect(initialsFor("   ")).toBe("??");
  });
});

describe("hueFor", () => {
  it("gives the same key the same hue every time", () => {
    expect(hueFor("ACA")).toBe(hueFor("ACA"));
  });

  it("stays inside a hue wheel", () => {
    for (const key of ["ACA", "KLM", "Lufthansa", "", "Ethiopian"]) {
      const hue = hueFor(key);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });
});

describe("tallyAirlines", () => {
  it("counts by airline, busiest first", () => {
    const summary = tallyAirlines([
      aircraft("a", { airline: "Air Canada", airlineIcao: "ACA" }),
      aircraft("b", { airline: "Cathay Pacific", airlineIcao: "CPA" }),
      aircraft("c", { airline: "Air Canada", airlineIcao: "ACA" }),
      aircraft("d", { airline: "Air Canada", airlineIcao: "ACA" }),
    ]);

    expect(summary.airlines.map((entry) => [entry.name, entry.count])).toEqual([
      ["Air Canada", 3],
      ["Cathay Pacific", 1],
    ]);
    expect(summary.airlines[0]!.code).toBe("ACA");
  });

  it("groups one carrier under two spellings by its code", () => {
    const summary = tallyAirlines([
      aircraft("a", { airline: "Air Canada", airlineIcao: "ACA" }),
      aircraft("b", { noRoute: true, operator: "Air Canada Rouge", operatorIcao: "ACA" }),
    ]);

    expect(summary.airlines).toHaveLength(1);
    expect(summary.airlines[0]!.count).toBe(2);
  });

  it("breaks ties alphabetically so equal counts do not shuffle between polls", () => {
    const summary = tallyAirlines([
      aircraft("a", { airline: "WestJet" }),
      aircraft("b", { airline: "Air India" }),
      aircraft("c", { airline: "Delta" }),
    ]);

    expect(summary.airlines.map((entry) => entry.name)).toEqual([
      "Air India",
      "Delta",
      "WestJet",
    ]);
  });

  it("counts only the aircraft neither lookup has named", () => {
    const summary = tallyAirlines([
      aircraft("a", { airline: "Air Canada" }),
      aircraft("b", { noRoute: true, operator: "Turkish Airlines", operatorIcao: "THY" }),
      aircraft("c", { noRoute: true }),
      aircraft("d", { airline: "   " }),
    ]);

    expect(summary.airlines).toHaveLength(2);
    expect(summary.unidentified).toBe(2);
  });

  it("caps the list but still reports how many airlines there were", () => {
    const summary = tallyAirlines(
      ["Alpha", "Bravo", "Charlie", "Delta", "Echo"].map((name, index) =>
        aircraft(String(index), { airline: name }),
      ),
      2,
    );

    expect(summary.airlines).toHaveLength(2);
    expect(summary.total).toBe(5);
  });

  it("is empty, not broken, on an empty board", () => {
    expect(tallyAirlines([])).toEqual({ airlines: [], unidentified: 0, total: 0 });
  });
});
