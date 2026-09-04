import { describe, expect, it } from "vitest";
import { findAirport } from "../src/config/airports.js";
import { arrivesAt, departsFrom, isSameAirport } from "../src/domain/route.js";
import type { FlightRoute } from "../src/types.js";

const YYZ = findAirport("CYYZ")!;

const airport = (iata: string | null, icao: string | null) => ({
  iata,
  icao,
  name: null,
  city: null,
  countryIso: null,
});

const route = (from: string, to: string): FlightRoute => ({
  origin: airport(from, null),
  destination: airport(to, null),
  airline: null,
  callsignIata: null,
  arrivesHere: false,
});

describe("isSameAirport", () => {
  it("matches on ICAO", () => {
    expect(isSameAirport(airport(null, "CYYZ"), YYZ)).toBe(true);
  });

  it("matches on IATA, since the database fills one or the other", () => {
    expect(isSameAirport(airport("YYZ", null), YYZ)).toBe(true);
  });

  it("does not match a different airport", () => {
    expect(isSameAirport(airport("YYC", "CYYC"), YYZ)).toBe(false);
  });

  it("does not match nothing", () => {
    expect(isSameAirport(null, YYZ)).toBe(false);
    expect(isSameAirport(airport(null, null), YYZ)).toBe(false);
  });
});

describe("arrivesAt", () => {
  it("is true when the scheduled destination is the airport being watched", () => {
    expect(arrivesAt(route("DXB", "YYZ"), YYZ)).toBe(true);
  });

  it("is false for an unrelated city pair", () => {
    // Measured against real short-final traffic, this is the common case.
    expect(arrivesAt(route("YXX", "YYC"), YYZ)).toBe(false);
  });

  it("is false when the pair is the outbound leg of this flight number", () => {
    expect(arrivesAt(route("YYZ", "YVR"), YYZ)).toBe(false);
  });

  it("is false when there is no route at all", () => {
    expect(arrivesAt(null, YYZ)).toBe(false);
  });
});

describe("departsFrom", () => {
  it("spots the reversed leg, where the number is right and the direction is not", () => {
    expect(departsFrom(route("YYZ", "YVR"), YYZ)).toBe(true);
    expect(departsFrom(route("DXB", "YYZ"), YYZ)).toBe(false);
  });
});
