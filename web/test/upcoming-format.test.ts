import { describe, expect, it } from "vitest";
import { minutesUntil, originOf, statusLabel, statusTone } from "../src/upcoming";

/**
 * The status vocabulary is AeroDataBox's, not ours. These pin the mapping for the
 * ones the fixture actually contains, plus the awkward spellings the vendor uses.
 */

describe("statusTone", () => {
  it("tones the statuses the schedule really sends", () => {
    expect(statusTone("Expected")).toBe("expected");
    expect(statusTone("Delayed")).toBe("delayed");
  });

  it("treats an uncertain cancellation as a cancellation", () => {
    expect(statusTone("CanceledUncertain")).toBe("cancelled");
    expect(statusTone("Canceled")).toBe("cancelled");
  });

  it("has a tone for arrivals and for nothing at all", () => {
    expect(statusTone("Arrived")).toBe("arrived");
    expect(statusTone(null)).toBe("unknown");
    expect(statusTone("Nonsense")).toBe("unknown");
  });
});

describe("statusLabel", () => {
  it("spells the vendor's own words properly", () => {
    expect(statusLabel("EnRoute")).toBe("En route");
    expect(statusLabel("CanceledUncertain")).toBe("Cancelled");
    expect(statusLabel("GateClosed")).toBe("Gate closed");
  });

  it("splits an unfamiliar status rather than dropping it", () => {
    expect(statusLabel("SomeNewStatus")).toBe("Some new status");
  });

  it("is empty when there is no status", () => {
    expect(statusLabel(null)).toBe("");
  });
});

describe("originOf", () => {
  it("prefers the airport name and keeps the code beside it", () => {
    expect(originOf({ icao: "VHHH", iata: "HKG", name: "Hong Kong" })).toEqual({
      name: "Hong Kong",
      code: "HKG",
    });
  });

  it("falls back to the code as the name when there is no name", () => {
    expect(originOf({ icao: "VHHH", iata: null, name: null })).toEqual({
      name: "VHHH",
      code: null,
    });
  });

  it("is null when the schedule gave nothing", () => {
    expect(originOf(null)).toBeNull();
    expect(originOf({ icao: null, iata: null, name: null })).toBeNull();
  });
});

describe("minutesUntil", () => {
  it("counts forward and backward from now", () => {
    const now = Date.parse("2026-09-11T12:00:00Z");
    expect(minutesUntil("2026-09-11T12:40:00Z", now)).toBe(40);
    expect(minutesUntil("2026-09-11T11:30:00Z", now)).toBe(-30);
  });
});
