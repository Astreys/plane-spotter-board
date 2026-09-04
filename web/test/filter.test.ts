import { describe, expect, it } from "vitest";
import { applyFilters, emptyStateText, matches } from "../src/filter";
import type { CategoryDto, InboundAircraft } from "../src/api";

/**
 * These mirror server/test/filters.test.ts on purpose. The two implementations
 * have to agree, so they get the same cases.
 */

const categories: CategoryDto[] = [
  { id: "DOUBLE_DECK", group: "airframe", label: "Double deck", blurb: "double deck", fallback: false },
  { id: "QUAD", group: "airframe", label: "Quad", blurb: "four-engined", fallback: false },
  { id: "WIDEBODY", group: "airframe", label: "Widebody", blurb: "widebody", fallback: false },
  { id: "OTHER", group: "airframe", label: "Other", blurb: "unclassified", fallback: true },
  { id: "FREIGHTER", group: "role", label: "Freighter", blurb: "freight", fallback: false },
  { id: "RARE", group: "interest", label: "Rare", blurb: "rare", fallback: false },
];

function aircraft(hex: string, ids: string[]): InboundAircraft {
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
    categories: ids,
    seenPosSec: 1,
  };
}

const a380 = aircraft("a380", ["DOUBLE_DECK", "QUAD", "WIDEBODY", "RARE"]);
const b77w = aircraft("b77w", ["WIDEBODY"]);
const b77f = aircraft("b77f", ["WIDEBODY", "FREIGHTER"]);
const b738 = aircraft("b738", ["OTHER"]);
const fdx738 = aircraft("fdx", ["OTHER", "FREIGHTER"]);
const all = [a380, b77w, b77f, b738, fdx738];

describe("matches", () => {
  it("passes everything when nothing is selected", () => {
    expect(all.every((ac) => matches(ac, [], categories))).toBe(true);
  });

  it("ORs within a group", () => {
    const selected = ["DOUBLE_DECK", "OTHER"];
    expect(matches(a380, selected, categories)).toBe(true);
    expect(matches(b738, selected, categories)).toBe(true);
    expect(matches(b77w, selected, categories)).toBe(false);
  });

  it("ANDs across groups", () => {
    const selected = ["WIDEBODY", "FREIGHTER"];
    expect(matches(b77f, selected, categories)).toBe(true);
    expect(matches(b77w, selected, categories)).toBe(false);
    expect(matches(fdx738, selected, categories)).toBe(false);
  });

  it("combines OR and AND together", () => {
    const selected = ["WIDEBODY", "OTHER", "FREIGHTER"];
    expect(applyFilters(all, selected, categories).map((ac) => ac.hex)).toEqual(["b77f", "fdx"]);
  });

  it("ignores a selection the config does not know about", () => {
    expect(matches(b77w, ["MADE_UP"], categories)).toBe(true);
  });
});

describe("emptyStateText", () => {
  it("says something useful with no filters", () => {
    expect(emptyStateText([], categories)).toBe("Nothing inbound right now");
  });

  it("names the single thing that is missing", () => {
    expect(emptyStateText(["WIDEBODY"], categories)).toBe("Nothing widebody inbound right now");
  });

  it("lists several selections readably", () => {
    expect(emptyStateText(["DOUBLE_DECK", "QUAD"], categories)).toBe(
      "Nothing double deck or four-engined inbound right now",
    );
    expect(emptyStateText(["DOUBLE_DECK", "QUAD", "RARE"], categories)).toBe(
      "Nothing double deck, four-engined or rare inbound right now",
    );
  });

  it("falls back when the config has not loaded yet", () => {
    expect(emptyStateText(["WIDEBODY"], [])).toBe("Nothing inbound right now");
  });
});
