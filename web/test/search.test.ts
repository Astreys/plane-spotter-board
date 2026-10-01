import { describe, expect, it } from "vitest";
import type { FlightRoute, InboundAircraft, UpcomingFlight } from "../src/api";
import {
  filterInbound,
  filterUpcoming,
  inboundHaystack,
  matchesTerms,
  normalise,
  termsOf,
} from "../src/search";

function route(overrides: Partial<FlightRoute> = {}): FlightRoute {
  return {
    origin: { iata: "SFO", icao: "KSFO", name: "San Francisco International", city: "San Francisco", countryIso: "US" },
    destination: { iata: "YYZ", icao: "CYYZ", name: null, city: "Toronto", countryIso: "CA" },
    airline: "Air Canada",
    callsignIata: "AC744",
    airlineIcao: "ACA",
    airlineIata: "AC",
    source: "schedule",
    arrivesHere: true,
    ...overrides,
  };
}

function aircraft(hex: string, overrides: Partial<InboundAircraft> = {}): InboundAircraft {
  return {
    hex,
    callsign: "ACA744",
    registration: "C-GJVT",
    type: "A320",
    typeName: "Airbus A320",
    altitudeFt: 1400,
    groundSpeedKt: 130,
    verticalRateFpm: -700,
    trackDeg: 240,
    lat: 43.7,
    lon: -79.5,
    distanceNm: 3.8,
    bearingFromAirportDeg: 60,
    fromDirection: "ENE",
    minutesOut: 3,
    categories: ["OTHER"],
    route: route(),
    operator: "Air Canada",
    operatorIcao: "ACA",
    seenPosSec: 1,
    ...overrides,
  };
}

function flight(overrides: Partial<UpcomingFlight> = {}): UpcomingFlight {
  return {
    number: "EK 241",
    callsign: "UAE241",
    airline: "Emirates",
    airlineIcao: "UAE",
    airlineIata: "EK",
    status: "Expected",
    isCargo: false,
    type: "A388",
    model: "Airbus A380-800",
    typeName: "Airbus A380-800",
    registration: "A6-EEO",
    hex: "896123",
    origin: { icao: "OMDB", iata: "DXB", name: "Dubai" },
    arrivalTime: "2026-09-13T13:35:00Z",
    arrivalIsRevised: false,
    terminal: "1",
    gate: null,
    categories: ["DOUBLE_DECK", "QUAD", "WIDEBODY", "RARE"],
    ...overrides,
  };
}

describe("normalise and termsOf", () => {
  it("strips accents so nobody has to type them", () => {
    expect(normalise("Montréal")).toBe("montreal");
    expect(normalise("São Paulo")).toBe("sao paulo");
  });

  it("splits a query into lowercase terms and ignores extra spaces", () => {
    expect(termsOf("  Air   CANADA ")).toEqual(["air", "canada"]);
    expect(termsOf("   ")).toEqual([]);
  });
});

describe("matchesTerms", () => {
  it("needs every term, in any order", () => {
    expect(matchesTerms("air canada boeing 777", ["777", "canada"])).toBe(true);
    expect(matchesTerms("air canada airbus a320", ["777", "canada"])).toBe(false);
  });
});

describe("filterInbound", () => {
  const board = [
    aircraft("c05ea2"),
    aircraft("4bb279", {
      callsign: "THY17",
      registration: "TC-LSY",
      type: "A21N",
      typeName: "Airbus A321neo",
      operator: "Turkish Airlines",
      operatorIcao: "THY",
      route: route({
        airline: "Turkish Airlines",
        airlineIcao: "THY",
        airlineIata: "TK",
        callsignIata: "TK17",
        origin: { iata: "IST", icao: "LTFM", name: "Istanbul Airport", city: "Istanbul", countryIso: "TR" },
      }),
    }),
  ];

  it("returns the board untouched when there is no query", () => {
    expect(filterInbound(board, "")).toBe(board);
    expect(filterInbound(board, "   ")).toBe(board);
  });

  it("finds by airline, registration, type and callsign", () => {
    expect(filterInbound(board, "turkish").map((a) => a.hex)).toEqual(["4bb279"]);
    expect(filterInbound(board, "c-gjvt").map((a) => a.hex)).toEqual(["c05ea2"]);
    expect(filterInbound(board, "a320").map((a) => a.hex)).toEqual(["c05ea2"]);
    expect(filterInbound(board, "aca744").map((a) => a.hex)).toEqual(["c05ea2"]);
  });

  it("finds the flight number as it is written on a ticket", () => {
    expect(filterInbound(board, "AC744").map((a) => a.hex)).toEqual(["c05ea2"]);
  });

  it("finds by the city a trusted route comes from, without accents", () => {
    expect(filterInbound(board, "san francisco").map((a) => a.hex)).toEqual(["c05ea2"]);
    expect(filterInbound(board, "istanbul").map((a) => a.hex)).toEqual(["4bb279"]);
  });

  it("does not find a row by a city the row itself refuses to show", () => {
    // adsbdb's stored pair for ACA744: Montréal to New York, which is not this leg.
    const untrusted = aircraft("c05ea2", {
      route: route({
        origin: { iata: "YUL", icao: "CYUL", name: null, city: "Montréal", countryIso: "CA" },
        destination: { iata: "LGA", icao: "KLGA", name: null, city: "New York", countryIso: "US" },
        source: "callsign",
        arrivesHere: false,
      }),
    });

    expect(inboundHaystack(untrusted)).not.toContain("montreal");
    expect(filterInbound([untrusted], "montreal")).toEqual([]);
    // The dimmed codes are on the row, so they are still fair game.
    expect(filterInbound([untrusted], "yul")).toHaveLength(1);
  });

  it("survives an aircraft that knows almost nothing about itself", () => {
    const bare = aircraft("abcdef", {
      callsign: null,
      registration: null,
      type: null,
      typeName: null,
      operator: null,
      operatorIcao: null,
      route: null,
    });
    expect(filterInbound([bare], "anything")).toEqual([]);
  });
});

describe("filterUpcoming", () => {
  const schedule = [
    flight(),
    flight({
      number: "AC 126",
      callsign: "ACA126",
      airline: "Air Canada",
      airlineIcao: "ACA",
      airlineIata: "AC",
      type: "B77L",
      model: "Boeing 777-200LR",
      typeName: "Boeing 777-200LR",
      registration: "C-FIUF",
      origin: { icao: "CYVR", iata: "YVR", name: "Vancouver" },
      status: "Delayed",
      categories: ["WIDEBODY"],
    }),
  ];

  it("finds by flight number with or without the space", () => {
    expect(filterUpcoming(schedule, "EK 241").map((f) => f.number)).toEqual(["EK 241"]);
    expect(filterUpcoming(schedule, "ek241").map((f) => f.number)).toEqual(["EK 241"]);
  });

  it("finds by origin, airline, type and status", () => {
    expect(filterUpcoming(schedule, "vancouver").map((f) => f.number)).toEqual(["AC 126"]);
    expect(filterUpcoming(schedule, "emirates a380").map((f) => f.number)).toEqual(["EK 241"]);
    expect(filterUpcoming(schedule, "delayed").map((f) => f.number)).toEqual(["AC 126"]);
  });

  it("returns nothing, not everything, when nothing matches", () => {
    expect(filterUpcoming(schedule, "lufthansa")).toEqual([]);
  });
});
