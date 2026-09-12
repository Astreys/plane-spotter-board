import { describe, expect, it } from "vitest";
import { isDaylight, sunElevationDeg } from "../src/weather/sun.js";

/**
 * The icon picks a sun or a moon from this. A fixed "day is 06 to 18" would fail
 * the high-latitude cases below, which is why it is computed at all.
 */

const PEARSON = { lat: 43.6777, lon: -79.6248 };
const TROMSO = { lat: 69.6833, lon: 18.9189 };

describe("sunElevationDeg", () => {
  it("puts the sun at its expected noon height over Pearson", () => {
    // Solar noon at Pearson in mid-September is about 17:17Z, with the sun at
    // 90 - 43.7 (latitude) + 4.4 (declination), roughly 50.7 degrees up.
    const elevation = sunElevationDeg(new Date("2026-09-11T17:17:00Z"), PEARSON.lat, PEARSON.lon);
    expect(elevation).toBeGreaterThan(49.5);
    expect(elevation).toBeLessThan(52);
  });

  it("puts it well below the horizon over Pearson in the small hours", () => {
    const elevation = sunElevationDeg(new Date("2026-09-11T05:00:00Z"), PEARSON.lat, PEARSON.lon);
    expect(elevation).toBeLessThan(-20);
  });
});

describe("isDaylight", () => {
  it("is day at midday and night at 1am in Toronto", () => {
    expect(isDaylight(new Date("2026-09-11T17:00:00Z"), PEARSON.lat, PEARSON.lon)).toBe(true);
    expect(isDaylight(new Date("2026-09-11T05:00:00Z"), PEARSON.lat, PEARSON.lon)).toBe(false);
  });

  it("is night at noon in the polar winter", () => {
    // Solar noon in Tromso on the winter solstice, with the sun about 3 degrees
    // below the horizon. Any clock-based rule calls this day.
    expect(isDaylight(new Date("2026-12-21T10:45:00Z"), TROMSO.lat, TROMSO.lon)).toBe(false);
  });

  it("is day at midnight in the polar summer", () => {
    // Solar midnight in Tromso on the summer solstice: the sun never sets.
    expect(isDaylight(new Date("2026-06-21T22:45:00Z"), TROMSO.lat, TROMSO.lon)).toBe(true);
  });
});
