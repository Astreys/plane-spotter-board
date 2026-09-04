import { describe, expect, it } from "vitest";
import { CATEGORIES, categoriesFor, isCategoryId } from "../src/config/aircraft-types.js";

describe("categoriesFor", () => {
  it("puts the A380 in every airframe category it belongs to", () => {
    const categories = categoriesFor({ type: "A388" });
    expect(categories).toContain("DOUBLE_DECK");
    expect(categories).toContain("QUAD");
    expect(categories).toContain("WIDEBODY");
    expect(categories).toContain("RARE");
    expect(categories).not.toContain("OTHER");
  });

  it("treats every quad as a widebody", () => {
    const quad = CATEGORIES.find((c) => c.id === "QUAD")!;
    for (const type of quad.types) {
      expect(categoriesFor({ type }), `${type} should be a widebody`).toContain("WIDEBODY");
    }
  });

  it("treats every double decker as a quad", () => {
    const doubleDeck = CATEGORIES.find((c) => c.id === "DOUBLE_DECK")!;
    for (const type of doubleDeck.types) {
      expect(categoriesFor({ type }), `${type} should be a quad`).toContain("QUAD");
    }
  });

  it("classifies a twin widebody without calling it a quad", () => {
    const categories = categoriesFor({ type: "B77W" });
    expect(categories).toEqual(["WIDEBODY"]);
  });

  it("is case and whitespace insensitive", () => {
    expect(categoriesFor({ type: " b77w " })).toEqual(["WIDEBODY"]);
  });

  it("buckets unknown type codes into OTHER instead of dropping them", () => {
    expect(categoriesFor({ type: "ZZZZ" })).toEqual(["OTHER"]);
  });

  it("buckets a missing type code into OTHER", () => {
    expect(categoriesFor({ type: null })).toEqual(["OTHER"]);
    expect(categoriesFor({})).toEqual(["OTHER"]);
  });

  it("buckets a known narrowbody into OTHER", () => {
    expect(categoriesFor({ type: "B738" })).toEqual(["OTHER"]);
  });

  it("flags freight by callsign even when the airframe is not a freighter type", () => {
    const categories = categoriesFor({ type: "B763", callsign: "CJT501" });
    expect(categories).toContain("FREIGHTER");
    expect(categories).toContain("WIDEBODY");
  });

  it("does not flag freight for a passenger callsign", () => {
    expect(categoriesFor({ type: "B763", callsign: "ACA123" })).not.toContain("FREIGHTER");
  });

  it("only applies the OTHER fallback within the airframe group", () => {
    // A freighter-by-callsign narrowbody is still airframe-OTHER.
    const categories = categoriesFor({ type: "B738", callsign: "FDX1234" });
    expect(categories).toContain("OTHER");
    expect(categories).toContain("FREIGHTER");
  });

  it("returns categories in declaration order, so the UI is stable", () => {
    const order = CATEGORIES.map((c) => c.id);
    const categories = categoriesFor({ type: "A388" });
    const indices = categories.map((id) => order.indexOf(id));
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });
});

describe("isCategoryId", () => {
  it("accepts known ids and rejects anything else", () => {
    expect(isCategoryId("WIDEBODY")).toBe(true);
    expect(isCategoryId("widebody")).toBe(false);
    expect(isCategoryId("DROP TABLE")).toBe(false);
  });
});

describe("taxonomy integrity", () => {
  it("has unique category ids", () => {
    const ids = CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses uppercase four-character type codes throughout", () => {
    for (const category of CATEGORIES) {
      for (const type of category.types) {
        expect(type, `${category.id} has a malformed code`).toMatch(/^[A-Z0-9]{3,4}$/);
      }
    }
  });

  it("has exactly one fallback bucket per group that declares one", () => {
    const fallbacks = CATEGORIES.filter((c) => c.fallback);
    const groups = fallbacks.map((c) => c.group);
    expect(new Set(groups).size).toBe(fallbacks.length);
  });
});
