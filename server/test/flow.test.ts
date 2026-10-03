import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { findAirport } from "../src/config/airports.js";
import { landingDirectionsFor } from "../src/config/runways.js";
import { FlowTracker, alignedDirection, inferLandingFlow } from "../src/domain/flow.js";
import { selectInbound } from "../src/domain/inbound.js";
import type { RawSnapshot } from "../src/adsb/types.js";
import type { InboundAircraft, LandingFlow } from "../src/types.js";

/**
 * The runway in use is written in the sky: an aircraft a minute from touchdown is
 * lined up on the centreline. These cover the two ways that goes wrong — aircraft
 * still being vectored, and a sky too empty to say anything at all.
 */

const YYZ = findAirport("CYYZ")!;
const YYZ_DIRECTIONS = landingDirectionsFor("CYYZ");

function aircraft(overrides: Partial<InboundAircraft> = {}): InboundAircraft {
  return {
    hex: "abc123",
    callsign: "ACA123",
    registration: null,
    type: "A320",
    typeName: "Airbus A320",
    altitudeFt: 2000,
    groundSpeedKt: 150,
    verticalRateFpm: -700,
    trackDeg: 47,
    lat: 43.6,
    lon: -79.7,
    distanceNm: 5,
    bearingFromAirportDeg: 227,
    fromDirection: "SW",
    minutesOut: 2,
    categories: ["OTHER"],
    route: null,
    operator: null,
    operatorIcao: null,
    seenPosSec: 1,
    ...overrides,
  };
}

describe("alignedDirection", () => {
  it("matches a track to the runway direction it is flying", () => {
    expect(alignedDirection(47, YYZ_DIRECTIONS)?.label).toBe("05/06");
    expect(alignedDirection(227, YYZ_DIRECTIONS)?.label).toBe("23/24");
    expect(alignedDirection(137, YYZ_DIRECTIONS)?.label).toBe("15");
  });

  it("tolerates the wander of a real approach", () => {
    // Measured tracks on final at Pearson ranged 39 to 46 against a runway of 47.
    expect(alignedDirection(39, YYZ_DIRECTIONS)?.label).toBe("05/06");
    expect(alignedDirection(58, YYZ_DIRECTIONS)?.label).toBe("05/06");
  });

  it("refuses a track that matches no runway", () => {
    // 336 is an aircraft on downwind, not landing northwest.
    expect(alignedDirection(336, YYZ_DIRECTIONS)).toBeNull();
    expect(alignedDirection(90, YYZ_DIRECTIONS)).toBeNull();
  });
});

describe("inferLandingFlow", () => {
  it("reads the direction off an aircraft about to land", () => {
    const flow = inferLandingFlow([aircraft({ trackDeg: 45, minutesOut: 2 })], YYZ_DIRECTIONS, YYZ.elevationFt);

    expect(flow).toMatchObject({
      label: "05/06",
      words: "northeast",
      confidence: "firm",
      sample: 1,
    });
    // Where to stand: aircraft arrive from the opposite side.
    expect(flow?.approachFrom).toBe("southwest");
  });

  it("ignores an aircraft being vectored, however close it is", () => {
    const flow = inferLandingFlow(
      [
        aircraft({ hex: "a", trackDeg: 46, distanceNm: 4 }),
        // Mid-downwind, lined up with nothing.
        aircraft({ hex: "b", trackDeg: 336, distanceNm: 6, minutesOut: 3 }),
      ],
      YYZ_DIRECTIONS,
      YYZ.elevationFt,
    );

    expect(flow?.label).toBe("05/06");
    expect(flow?.sample).toBe(1);
  });

  it("lets the aircraft on final outvote one further out", () => {
    // A distant aircraft still turning can be lined up with the opposite runway.
    const flow = inferLandingFlow(
      [
        aircraft({ hex: "far", trackDeg: 227, distanceNm: 14, minutesOut: 9, altitudeFt: 4500 }),
        aircraft({ hex: "near", trackDeg: 48, distanceNm: 3, minutesOut: 1 }),
      ],
      YYZ_DIRECTIONS,
      YYZ.elevationFt,
    );

    expect(flow?.label).toBe("05/06");
    expect(flow?.confidence).toBe("firm");
  });

  it("falls back to traffic further out, less confidently", () => {
    const flow = inferLandingFlow(
      [aircraft({ trackDeg: 228, distanceNm: 13, minutesOut: 8, altitudeFt: 4000 })],
      YYZ_DIRECTIONS,
      YYZ.elevationFt,
    );

    expect(flow?.label).toBe("23/24");
    expect(flow?.confidence).toBe("likely");
  });

  it("says nothing rather than guessing from an empty sky", () => {
    expect(inferLandingFlow([], YYZ_DIRECTIONS, YYZ.elevationFt)).toBeNull();
  });

  it("says nothing when nothing in the sky lines up", () => {
    const flow = inferLandingFlow(
      [aircraft({ trackDeg: 336 }), aircraft({ hex: "b", trackDeg: 90 })],
      YYZ_DIRECTIONS,
      YYZ.elevationFt,
    );
    expect(flow).toBeNull();
  });

  it("ignores aircraft too high to be committed to a runway", () => {
    // Over Pearson's 569 ft field, 12,000 ft is still an arrival being positioned.
    const flow = inferLandingFlow(
      [aircraft({ trackDeg: 47, altitudeFt: 12_000, distanceNm: 12, minutesOut: 9 })],
      YYZ_DIRECTIONS,
      YYZ.elevationFt,
    );
    expect(flow).toBeNull();
  });

  it("breaks a tie with the aircraft nearest touchdown", () => {
    // Seen live at JFK, which lands 04 and 13 at the same time: two directions,
    // one vote each. The nearer aircraft is the better evidence.
    const flow = inferLandingFlow(
      [
        aircraft({ hex: "far", trackDeg: 137, distanceNm: 7, minutesOut: 3 }),
        aircraft({ hex: "near", trackDeg: 47, distanceNm: 2, minutesOut: 1 }),
      ],
      YYZ_DIRECTIONS,
      YYZ.elevationFt,
    );

    expect(flow?.label).toBe("05/06");
    // Still a tie on votes, so it does not claim to be firm.
    expect(flow?.confidence).toBe("likely");
  });

  it("admits a tie rather than picking a side", () => {
    const flow = inferLandingFlow(
      [
        aircraft({ hex: "a", trackDeg: 47, distanceNm: 4 }),
        aircraft({ hex: "b", trackDeg: 137, distanceNm: 4 }),
      ],
      YYZ_DIRECTIONS,
      YYZ.elevationFt,
    );
    expect(flow?.confidence).toBe("likely");
  });

  it("reports nothing for an airport with no runway table", () => {
    expect(inferLandingFlow([aircraft()], landingDirectionsFor("LFPG"))).toBeNull();
  });
});

describe("against the captured Pearson snapshot", () => {
  it("reads it as landing northeast", () => {
    const raw = JSON.parse(
      fs.readFileSync(new URL("./fixtures/yyz-live.json", import.meta.url), "utf8"),
    ) as RawSnapshot;

    const inbound = selectInbound(raw.ac, YYZ);
    const flow = inferLandingFlow(inbound, YYZ_DIRECTIONS, YYZ.elevationFt);

    expect(flow?.label).toBe("05/06");
    expect(flow?.words).toBe("northeast");
    expect(flow?.approachFrom).toBe("southwest");
  });
});

describe("FlowTracker", () => {
  const flow = (label: string): LandingFlow => ({
    headingDeg: label === "05/06" ? 47 : 227,
    label,
    idents: [],
    compass: label === "05/06" ? "NE" : "SW",
    words: label === "05/06" ? "northeast" : "southwest",
    approachFrom: label === "05/06" ? "southwest" : "northeast",
    sample: 1,
    confidence: "firm",
  });

  it("adopts the first direction it is given", () => {
    const tracker = new FlowTracker();
    expect(tracker.update(flow("05/06"))?.label).toBe("05/06");
  });

  it("does not turn the airport around on one poll", () => {
    // Airports do change direction; they do not change it every fifteen seconds.
    const tracker = new FlowTracker();
    tracker.update(flow("05/06"));

    expect(tracker.update(flow("23/24"))?.label).toBe("05/06");
    expect(tracker.update(flow("23/24"))?.label).toBe("23/24");
  });

  it("forgets a contender that does not persist", () => {
    const tracker = new FlowTracker();
    tracker.update(flow("05/06"));

    tracker.update(flow("23/24"));
    // The original comes back, so the count starts again from nothing.
    expect(tracker.update(flow("05/06"))?.label).toBe("05/06");
    expect(tracker.update(flow("23/24"))?.label).toBe("05/06");
  });

  it("holds the last direction through a quiet spell, then lets go", () => {
    const tracker = new FlowTracker(2, 10 * 60_000);
    const start = Date.parse("2026-09-30T12:00:00Z");
    tracker.update(flow("05/06"), start);

    // Nothing in the sky five minutes later: still the best answer we have.
    expect(tracker.update(null, start + 5 * 60_000)?.label).toBe("05/06");
    // Twenty minutes on, it is no longer worth claiming.
    expect(tracker.update(null, start + 20 * 60_000)).toBeNull();
  });

  it("has nothing to say before it has seen anything", () => {
    expect(new FlowTracker().update(null)).toBeNull();
  });
});
