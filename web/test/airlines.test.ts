import { describe, expect, it } from "vitest";
import { hueFor, initialsFor, tallyAirlines } from "../src/airlines";
import type { InboundAircraft, FlightRoute } from "../src/api";

function route(airline: string | null): FlightRoute {
  return {
    origin: null,
    destination: null,
    airline,
    callsignIata: null,
    arrivesHere: true,
  };
}

function aircraft(hex: string, airline: string | null | undefined): InboundAircraft {
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
    // undefined means the route lookup has not landed; null means it found no airline.
    route: airline === undefined ? null : route(airline),
    seenPosSec: 1,
  };
}

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
  it("gives the same name the same hue every time", () => {
    expect(hueFor("Air Canada")).toBe(hueFor("Air Canada"));
  });

  it("stays inside a hue wheel", () => {
    for (const name of ["Air Canada", "KLM", "Lufthansa", "", "Ethiopian"]) {
      const hue = hueFor(name);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });
});

describe("tallyAirlines", () => {
  it("counts by airline, busiest first", () => {
    const summary = tallyAirlines([
      aircraft("a", "Air Canada"),
      aircraft("b", "Cathay Pacific"),
      aircraft("c", "Air Canada"),
      aircraft("d", "Air Canada"),
    ]);

    expect(summary.airlines.map((entry) => [entry.name, entry.count])).toEqual([
      ["Air Canada", 3],
      ["Cathay Pacific", 1],
    ]);
  });

  it("breaks ties alphabetically so equal counts do not shuffle between polls", () => {
    const summary = tallyAirlines([
      aircraft("a", "WestJet"),
      aircraft("b", "Air India"),
      aircraft("c", "Delta"),
    ]);

    expect(summary.airlines.map((entry) => entry.name)).toEqual([
      "Air India",
      "Delta",
      "WestJet",
    ]);
  });

  it("reports aircraft the route lookup has not named", () => {
    const summary = tallyAirlines([
      aircraft("a", "Air Canada"),
      aircraft("b", undefined),
      aircraft("c", null),
      aircraft("d", "   "),
    ]);

    expect(summary.airlines).toHaveLength(1);
    // No route, a null airline and a blank one are all equally unidentified.
    expect(summary.unidentified).toBe(3);
  });

  it("caps the list but still reports how many airlines there were", () => {
    const summary = tallyAirlines(
      ["Alpha", "Bravo", "Charlie", "Delta", "Echo"].map((name, index) =>
        aircraft(String(index), name),
      ),
      2,
    );

    expect(summary.airlines).toHaveLength(2);
    expect(summary.total).toBe(5);
  });

  it("trims so the same carrier does not split into two rows", () => {
    const summary = tallyAirlines([aircraft("a", "Air Canada"), aircraft("b", " Air Canada ")]);

    expect(summary.airlines).toEqual([
      expect.objectContaining({ name: "Air Canada", count: 2 }),
    ]);
  });

  it("is empty, not broken, on an empty board", () => {
    expect(tallyAirlines([])).toEqual({ airlines: [], unidentified: 0, total: 0 });
  });
});
