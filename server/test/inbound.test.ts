import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findAirport } from "../src/config/airports.js";
import type { RawAircraft, RawSnapshot } from "../src/adsb/types.js";
import { estimateMinutesOut, judge, normalize, selectInbound } from "../src/domain/inbound.js";

const YYZ = findAirport("CYYZ")!;
const here = path.dirname(fileURLToPath(import.meta.url));

const readFixture = (name: string): RawSnapshot =>
  JSON.parse(fs.readFileSync(path.join(here, "fixtures", name), "utf8")) as RawSnapshot;

/** A textbook arrival: 20 nm southwest, descending, pointed at the field. */
const arrival: RawAircraft = {
  hex: "c06a1b",
  flight: "ACA123  ",
  r: "C-FIVR",
  t: "B77W",
  alt_baro: 5000,
  gs: 240,
  track: 55,
  baro_rate: -900,
  lat: 43.4,
  lon: -79.9,
  seen_pos: 1.2,
};

const at = (overrides: Partial<RawAircraft>): RawAircraft => ({ ...arrival, ...overrides });

describe("normalize", () => {
  it("trims the space-padded callsign", () => {
    expect(normalize(arrival)!.callsign).toBe("ACA123");
  });

  it("uppercases the type code and lowercases the hex", () => {
    const ac = normalize(at({ hex: "C06A1B", t: "b77w" }))!;
    expect(ac.type).toBe("B77W");
    expect(ac.hex).toBe("c06a1b");
  });

  it("reads a ground altitude string as on-ground with no altitude", () => {
    const ac = normalize(at({ alt_baro: "ground" }))!;
    expect(ac.onGround).toBe(true);
    expect(ac.altitudeFt).toBeNull();
  });

  it("returns null when there is no position to work with", () => {
    expect(normalize(at({ lat: undefined }))).toBeNull();
    expect(normalize(at({ lon: undefined }))).toBeNull();
  });

  it("returns null when there is no hex", () => {
    expect(normalize(at({ hex: undefined }))).toBeNull();
  });

  it("keeps missing optional fields as null rather than guessing", () => {
    const ac = normalize({ hex: "abc123", lat: 43.4, lon: -79.9 })!;
    expect(ac.callsign).toBeNull();
    expect(ac.registration).toBeNull();
    expect(ac.type).toBeNull();
    expect(ac.altitudeFt).toBeNull();
    expect(ac.groundSpeedKt).toBeNull();
    expect(ac.verticalRateFpm).toBeNull();
    expect(ac.trackDeg).toBeNull();
  });

  it("falls back to geom_rate when baro_rate is absent", () => {
    expect(normalize(at({ baro_rate: undefined, geom_rate: -1200 }))!.verticalRateFpm).toBe(-1200);
  });

  it("assumes a fresh position when seen_pos is absent", () => {
    expect(normalize(at({ seen_pos: undefined }))!.seenPosSec).toBe(0);
  });

  it("rejects a non-numeric altitude that is not the ground marker", () => {
    const ac = normalize(at({ alt_baro: "unknown" as unknown as number }))!;
    expect(ac.altitudeFt).toBeNull();
    expect(ac.onGround).toBe(false);
  });
});

describe("judge", () => {
  const verdict = (raw: RawAircraft) => judge(normalize(raw)!, YYZ);

  it("accepts a descending aircraft pointed at the field", () => {
    expect(verdict(arrival).inbound).toBe(true);
  });

  it("rejects anything on the ground", () => {
    expect(verdict(at({ alt_baro: "ground" }))).toMatchObject({
      inbound: false,
      reason: "on ground",
    });
  });

  it("rejects aircraft above the altitude ceiling", () => {
    expect(verdict(at({ alt_baro: 20000 })).reason).toBe("too high");
  });

  it("rejects aircraft beyond the distance limit", () => {
    // Roughly 90 nm east of the field.
    expect(verdict(at({ lat: 43.6777, lon: -77.5, track: 270 })).reason).toBe("too far");
  });

  it("rejects departures climbing out", () => {
    expect(verdict(at({ baro_rate: 2400 })).reason).toBe("climbing out");
  });

  it("rejects level traffic above the low-altitude cutoff", () => {
    expect(verdict(at({ alt_baro: 9000, baro_rate: 0 })).reason).toBe("level and high");
  });

  it("accepts level traffic once it is low, per the OR clause in the spec", () => {
    expect(verdict(at({ alt_baro: 3000, baro_rate: 0 })).inbound).toBe(true);
  });

  it("rejects aircraft tracking away from the field", () => {
    expect(verdict(at({ track: 235 })).reason).toBe("pointing away");
  });

  it("rejects a stale position", () => {
    expect(verdict(at({ seen_pos: 120 })).reason).toBe("stale position");
  });

  it("rejects an aircraft with no track, since we cannot tell where it is going", () => {
    expect(verdict(at({ track: undefined })).reason).toBe("no track");
  });

  it("rejects an aircraft with no altitude", () => {
    expect(verdict(at({ alt_baro: undefined })).reason).toBe("no altitude");
  });

  it("measures altitude against field elevation, not sea level", () => {
    const calgary = findAirport("CYYC")!; // 3557 ft field
    // 15,000 ft is 11,443 ft above Calgary, which is inside the ceiling.
    const nearCalgary = at({ lat: 51.0, lon: -114.0, track: 0, alt_baro: 15000 });
    expect(judge(normalize(nearCalgary)!, calgary).inbound).toBe(true);
    // The same altitude near Toronto is above the ceiling.
    expect(verdict(at({ alt_baro: 15000 })).reason).toBe("too high");
  });

  it("reports distance and bearing even when it rejects", () => {
    const result = verdict(at({ alt_baro: 30000 }));
    expect(result.inbound).toBe(false);
    expect(result.distanceNm).toBeGreaterThan(0);
    expect(result.bearingFromAirportDeg).toBeGreaterThanOrEqual(0);
  });
});

describe("estimateMinutesOut", () => {
  it("scales with distance and speed", () => {
    const near = estimateMinutesOut(10, 240)!;
    const far = estimateMinutesOut(40, 240)!;
    expect(far).toBeGreaterThan(near);
  });

  it("is in a sane range for a typical approach", () => {
    // 20 nm at 240 kt is 5 minutes of flying, plus deceleration padding.
    expect(estimateMinutesOut(20, 240)).toBeGreaterThanOrEqual(5);
    expect(estimateMinutesOut(20, 240)).toBeLessThanOrEqual(8);
  });

  it("gives up rather than guessing when ground speed is missing", () => {
    expect(estimateMinutesOut(20, null)).toBeNull();
  });

  it("gives up on implausibly slow ground speeds", () => {
    expect(estimateMinutesOut(20, 5)).toBeNull();
  });
});

describe("selectInbound", () => {
  it("survives an empty or missing aircraft list", () => {
    expect(selectInbound(undefined, YYZ)).toEqual([]);
    expect(selectInbound([], YYZ)).toEqual([]);
  });

  it("does not throw on junk records", () => {
    const junk = [
      {},
      { hex: "abc" },
      { hex: "abc", lat: "nope" as unknown as number, lon: -79 },
      { hex: "abc", lat: 43.4, lon: -79.9, alt_baro: null as unknown as number },
    ];
    expect(() => selectInbound(junk, YYZ)).not.toThrow();
    expect(selectInbound(junk, YYZ)).toEqual([]);
  });

  it("sorts soonest first and puts unknown ETAs last", () => {
    const list = [
      at({ hex: "far", lat: 43.2, lon: -80.2 }),
      at({ hex: "near", lat: 43.55, lon: -79.75 }),
      at({ hex: "nogs", lat: 43.45, lon: -79.85, gs: undefined }),
    ];
    expect(selectInbound(list, YYZ).map((ac) => ac.hex)).toEqual(["near", "far", "nogs"]);
  });

  it("classifies each result", () => {
    const [result] = selectInbound([arrival], YYZ);
    expect(result!.categories).toEqual(["WIDEBODY"]);
    expect(result!.typeName).toBe("Boeing 777-300ER");
    expect(result!.fromDirection).toBe("SW");
  });
});

describe("fixtures", () => {
  it("picks the right aircraft out of the edge-case fixture", () => {
    const inbound = selectInbound(readFixture("edge-cases.json").ac, YYZ);
    const hexes = inbound.map((ac) => ac.hex);

    // Kept: A380, MD-11 freighter, Cargojet 767, an inbound 777, an unknown type.
    expect(hexes).toContain("4bb279");
    expect(hexes).toContain("a1b2c3");
    expect(hexes).toContain("c01234");
    expect(hexes).toContain("ded001");
    expect(hexes).toContain("unk001");

    // Dropped, one per rule.
    expect(hexes).not.toContain("gr0und"); // on the ground
    expect(hexes).not.toContain("dep001"); // climbing out
    expect(hexes).not.toContain("hi0001"); // too high
    expect(hexes).not.toContain("far001"); // too far
    expect(hexes).not.toContain("awy001"); // tracking away
    expect(hexes).not.toContain("stl001"); // stale position
    // The record with no hex cannot be identified at all.
    expect(inbound.some((ac) => ac.callsign === "NOHEX1")).toBe(false);
  });

  it("classifies the fixture aircraft as expected", () => {
    const byHex = new Map(
      selectInbound(readFixture("edge-cases.json").ac, YYZ).map((ac) => [ac.hex, ac]),
    );

    expect(byHex.get("4bb279")!.categories).toEqual(["DOUBLE_DECK", "QUAD", "WIDEBODY", "RARE"]);
    expect(byHex.get("a1b2c3")!.categories).toEqual(["WIDEBODY", "FREIGHTER", "RARE"]);
    // Cargojet 767: freight by callsign, not by type.
    expect(byHex.get("c01234")!.categories).toEqual(["WIDEBODY", "FREIGHTER"]);
    // No type code at all: visible in the Other bucket rather than dropped.
    expect(byHex.get("unk001")!.categories).toEqual(["OTHER"]);
    expect(byHex.get("unk001")!.type).toBeNull();
    expect(byHex.get("unk001")!.callsign).toBe("XYZ9");
  });

  it("handles a real captured YYZ snapshot without throwing", () => {
    const snapshot = readFixture("yyz-live.json");
    const inbound = selectInbound(snapshot.ac, YYZ);

    expect(snapshot.ac!.length).toBeGreaterThan(0);
    expect(inbound.length).toBeLessThan(snapshot.ac!.length);
    for (const ac of inbound) {
      expect(ac.distanceNm).toBeLessThanOrEqual(50);
      expect(ac.categories.length).toBeGreaterThan(0);
      expect(ac.hex).toMatch(/^[0-9a-f~]+$/);
    }
  });
});
