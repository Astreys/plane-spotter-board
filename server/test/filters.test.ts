import { describe, expect, it } from "vitest";
import { applyFilters, countByCategory, matches, parseCategories } from "../src/domain/filters.js";
import type { CategoryId } from "../src/config/aircraft-types.js";
import type { InboundAircraft } from "../src/types.js";

function aircraft(hex: string, categories: CategoryId[]): InboundAircraft {
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
    categories,
    route: null,
    seenPosSec: 1,
  };
}

const a380 = aircraft("a380", ["DOUBLE_DECK", "QUAD", "WIDEBODY", "RARE"]);
const b77w = aircraft("b77w", ["WIDEBODY"]);
const b77f = aircraft("b77f", ["WIDEBODY", "FREIGHTER"]);
const b738 = aircraft("b738", ["OTHER"]);
const fdx738 = aircraft("fdx", ["OTHER", "FREIGHTER"]);
const all = [a380, b77w, b77f, b738, fdx738];

describe("parseCategories", () => {
  it("reads a comma separated list", () => {
    expect(parseCategories("WIDEBODY,FREIGHTER").sort()).toEqual(["FREIGHTER", "WIDEBODY"]);
  });

  it("normalises case and whitespace", () => {
    expect(parseCategories(" widebody , rare ").sort()).toEqual(["RARE", "WIDEBODY"]);
  });

  it("drops unknown values instead of failing", () => {
    expect(parseCategories("WIDEBODY,NONSENSE,,")).toEqual(["WIDEBODY"]);
    expect(parseCategories("nothing-valid-here")).toEqual([]);
  });

  it("de-duplicates", () => {
    expect(parseCategories("RARE,RARE,rare")).toEqual(["RARE"]);
  });

  it("accepts repeated query params as an array", () => {
    expect(parseCategories(["WIDEBODY", "RARE,QUAD"]).sort()).toEqual([
      "QUAD",
      "RARE",
      "WIDEBODY",
    ]);
  });

  it("returns nothing for undefined", () => {
    expect(parseCategories(undefined)).toEqual([]);
  });
});

describe("matches", () => {
  it("passes everything when nothing is selected", () => {
    expect(all.every((ac) => matches(ac, []))).toBe(true);
  });

  it("ORs within a group", () => {
    // DOUBLE_DECK and OTHER are both airframe: either one qualifies.
    const selected: CategoryId[] = ["DOUBLE_DECK", "OTHER"];
    expect(matches(a380, selected)).toBe(true);
    expect(matches(b738, selected)).toBe(true);
    expect(matches(b77w, selected)).toBe(false);
  });

  it("ANDs across groups", () => {
    // WIDEBODY (airframe) AND FREIGHTER (role).
    const selected: CategoryId[] = ["WIDEBODY", "FREIGHTER"];
    expect(matches(b77f, selected)).toBe(true);
    expect(matches(b77w, selected)).toBe(false);
    expect(matches(fdx738, selected)).toBe(false);
  });

  it("combines OR and AND together", () => {
    // (widebody OR other) AND freighter
    const selected: CategoryId[] = ["WIDEBODY", "OTHER", "FREIGHTER"];
    expect(applyFilters(all, selected).map((ac) => ac.hex)).toEqual(["b77f", "fdx"]);
  });
});

describe("applyFilters", () => {
  it("returns the same list when nothing is selected", () => {
    expect(applyFilters(all, [])).toBe(all);
  });

  it("can return an empty result", () => {
    expect(applyFilters([b738], ["RARE"])).toEqual([]);
  });
});

describe("countByCategory", () => {
  it("counts an aircraft once per category it belongs to", () => {
    const counts = countByCategory(all);
    expect(counts.WIDEBODY).toBe(3);
    expect(counts.DOUBLE_DECK).toBe(1);
    expect(counts.FREIGHTER).toBe(2);
    expect(counts.OTHER).toBe(2);
    expect(counts.RARE).toBe(1);
  });

  it("reports zero rather than omitting empty categories", () => {
    const counts = countByCategory([]);
    expect(counts.WIDEBODY).toBe(0);
    expect(counts.QUAD).toBe(0);
  });
});
