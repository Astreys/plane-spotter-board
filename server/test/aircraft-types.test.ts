import { describe, expect, it } from "vitest";
import { CATEGORIES, TYPE_NAMES, categoriesFor, isCategoryId } from "../src/config/aircraft-types.js";

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

describe("TYPE_NAMES", () => {
  it("names the codes that actually show up on a board", () => {
    expect(TYPE_NAMES.E75S).toBe("Embraer ERJ-175SU");
    expect(TYPE_NAMES.E75L).toBe("Embraer ERJ-175LR");
    expect(TYPE_NAMES.A321).toBe("Airbus A321");
    expect(TYPE_NAMES.A21N).toBe("Airbus A321neo");
    expect(TYPE_NAMES.B38M).toBe("Boeing 737 MAX 8");
    expect(TYPE_NAMES.CRJ9).toBe("Bombardier CRJ900");
    expect(TYPE_NAMES.DH8D).toBe("De Havilland Dash 8-400");
    expect(TYPE_NAMES.C172).toBe("Cessna 172 Skyhawk");
    expect(TYPE_NAMES.BCS3).toBe("Airbus A220-300");
  });

  it("names every type the taxonomy classifies", () => {
    // Adding a code to a category without naming it leaves a row reading "B77X"
    // with no subtitle. Catch that here rather than on the board.
    const classified = [...new Set(CATEGORIES.flatMap((category) => category.types))];
    const unnamed = classified.filter((type) => !TYPE_NAMES[type]);
    expect(unnamed).toEqual([]);
  });

  it("uses well-formed uppercase codes as keys", () => {
    for (const key of Object.keys(TYPE_NAMES)) {
      expect(key, `${key} is not a plausible type code`).toMatch(/^[A-Z0-9]{2,4}$/);
    }
  });

  it("has no blank or placeholder names", () => {
    for (const [code, name] of Object.entries(TYPE_NAMES)) {
      expect(name.trim(), `${code} has an empty name`).not.toBe("");
      expect(name, `${code} still reads as a raw code`).not.toBe(code);
    }
  });

  it("leaves unknown codes unnamed rather than inventing something", () => {
    expect(TYPE_NAMES.ZZZZ).toBeUndefined();
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
