import { describe, expect, it } from "vitest";
import { angleBetween, bearing, compassPoint, distanceNm, normalizeDeg } from "../src/domain/geo.js";

const YYZ = { lat: 43.6777, lon: -79.6248 };

describe("distanceNm", () => {
  it("is zero for the same point", () => {
    expect(distanceNm(YYZ, YYZ)).toBe(0);
  });

  it("matches a known pair", () => {
    // YYZ -> JFK great circle is about 318 nm (366 statute miles).
    const jfk = { lat: 40.6398, lon: -73.7789 };
    expect(distanceNm(YYZ, jfk)).toBeGreaterThan(313);
    expect(distanceNm(YYZ, jfk)).toBeLessThan(322);
  });

  it("is symmetric", () => {
    const other = { lat: 43.9, lon: -78.9 };
    expect(distanceNm(YYZ, other)).toBeCloseTo(distanceNm(other, YYZ), 6);
  });

  it("converts one degree of latitude to about 60 nm", () => {
    expect(distanceNm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(60, 0);
  });
});

describe("bearing", () => {
  it("points north for a point due north", () => {
    expect(bearing({ lat: 43, lon: -79 }, { lat: 44, lon: -79 })).toBeCloseTo(0, 1);
  });

  it("points east for a point due east", () => {
    expect(bearing({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(90, 1);
  });

  it("returns 0-360, never negative", () => {
    // A great-circle course to a point due west is not exactly 270 away from the
    // equator - it starts slightly north of west. That is correct, not a bug.
    const west = bearing({ lat: 43, lon: -79 }, { lat: 43, lon: -80 });
    expect(west).toBeGreaterThanOrEqual(0);
    expect(west).toBeLessThan(360);
    expect(west).toBeCloseTo(270, 0);
  });
});

describe("angleBetween", () => {
  it("never exceeds 180", () => {
    expect(angleBetween(10, 350)).toBe(20);
    expect(angleBetween(350, 10)).toBe(20);
    expect(angleBetween(0, 180)).toBe(180);
    expect(angleBetween(0, 181)).toBe(179);
  });

  it("handles values outside 0-360", () => {
    expect(angleBetween(-10, 10)).toBe(20);
    expect(angleBetween(730, 10)).toBe(0);
  });
});

describe("normalizeDeg", () => {
  it("wraps into 0-360", () => {
    expect(normalizeDeg(-90)).toBe(270);
    expect(normalizeDeg(450)).toBe(90);
    expect(normalizeDeg(360)).toBe(0);
  });
});

describe("compassPoint", () => {
  it("labels the cardinals", () => {
    expect(compassPoint(0)).toBe("N");
    expect(compassPoint(90)).toBe("E");
    expect(compassPoint(180)).toBe("S");
    expect(compassPoint(270)).toBe("W");
    expect(compassPoint(359)).toBe("N");
  });

  it("labels the intercardinals", () => {
    expect(compassPoint(45)).toBe("NE");
    expect(compassPoint(225)).toBe("SW");
  });
});
