import { describe, expect, it } from "vitest";
import { formatAirportTime } from "../src/time";

/**
 * The masthead clock has to read as local time at the airport being watched. The
 * board tracks five fields across four zones, so the browser's own offset is
 * never the right answer and these pin that.
 */

// 22:48 in Toronto, which is what the design was drawn against.
const INSTANT = new Date("2026-09-11T02:48:00Z");

describe("formatAirportTime", () => {
  it("formats in the airport's zone, not the runtime's", () => {
    expect(formatAirportTime(INSTANT, "America/Toronto").time).toBe("22:48");
    expect(formatAirportTime(INSTANT, "Europe/London").time).toBe("03:48");
    expect(formatAirportTime(INSTANT, "America/Vancouver").time).toBe("19:48");
  });

  it("rolls the date over with the zone", () => {
    // The same instant is the 10th in Toronto and already the 11th in London.
    expect(formatAirportTime(INSTANT, "America/Toronto").date).toContain("Sep 10");
    expect(formatAirportTime(INSTANT, "Europe/London").date).toContain("Sep 11");
  });

  it("names the zone", () => {
    expect(formatAirportTime(INSTANT, "America/Toronto").zone).toBe("EDT");
  });

  it("uses a 24-hour clock and renders midnight as 00", () => {
    const midnight = new Date("2026-09-11T04:00:00Z");
    expect(formatAirportTime(midnight, "America/Toronto").time).toBe("00:00");
  });

  it("falls back rather than throwing on a zone the runtime does not know", () => {
    // Intl throws a RangeError here; a broken clock must not take the header down.
    expect(formatAirportTime(INSTANT, "Mars/Olympus_Mons").time).toBe("--:--");
  });

  it("falls back before the first snapshot names a zone", () => {
    expect(formatAirportTime(INSTANT, null)).toEqual({ time: "--:--", date: "", zone: "" });
  });
});
