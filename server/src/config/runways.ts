/**
 * Which ways aircraft can land at each airport.
 *
 * Not a list of runways — a list of *directions*. Pearson's 05, 06L and 06R all
 * share a true heading of 047: they are parallel strips, and the different
 * numbers are an artifact of magnetic variation drifting over the decades since
 * each was named. A spotter stands in one place for all three, so they are one
 * entry here, labelled the way a local says it: "05/06".
 *
 * **Headings are true, not magnetic.** Runway numbers are magnetic heading over
 * ten, and Toronto's variation is about 10 degrees, so a table in the wrong frame
 * is out by a whole designation — the mistake this file exists to avoid. ADS-B
 * reports ground track relative to true north, so the two compare directly.
 *
 * Generated from OurAirports (public domain), filtered to the airports in
 * airports.ts, with closed runways dropped. Its figures were checked against
 * observed tracks: aircraft on final at Pearson in the saved fixture average
 * 45.5 degrees, against the 47 recorded here.
 *
 * Adding an airport to airports.ts without adding it here is fine — the board
 * simply never reports a landing direction for it.
 */

export interface LandingDirection {
  /** True heading an aircraft flies when landing this way. */
  headingDeg: number;
  /** What a local calls it: "05/06", "23/24", "27". */
  label: string;
  /** Every runway end pointing this way. Left and right are one direction. */
  idents: readonly string[];
}

export const LANDING_DIRECTIONS: Readonly<Record<string, readonly LandingDirection[]>> = {
  CYYZ: [
    { headingDeg: 47, label: "05/06", idents: ["05", "06L", "06R"] },
    { headingDeg: 137, label: "15", idents: ["15L", "15R"] },
    { headingDeg: 227, label: "23/24", idents: ["23", "24L", "24R"] },
    { headingDeg: 317, label: "33", idents: ["33L", "33R"] },
  ],
  CYYC: [
    { headingDeg: 360, label: "35", idents: ["35L", "35R"] },
    { headingDeg: 120, label: "11", idents: ["11"] },
    { headingDeg: 180, label: "17", idents: ["17L", "17R"] },
    { headingDeg: 300, label: "29", idents: ["29"] },
  ],
  CYVR: [
    { headingDeg: 100, label: "08", idents: ["08L", "08R"] },
    { headingDeg: 142, label: "13", idents: ["13"] },
    { headingDeg: 280, label: "26", idents: ["26L", "26R"] },
    { headingDeg: 322, label: "31", idents: ["31"] },
  ],
  KJFK: [
    { headingDeg: 31, label: "04", idents: ["04L", "04R"] },
    { headingDeg: 121, label: "13", idents: ["13L", "13R"] },
    { headingDeg: 211, label: "22", idents: ["22L", "22R"] },
    { headingDeg: 301, label: "31", idents: ["31L", "31R"] },
  ],
  EGLL: [
    { headingDeg: 90, label: "09", idents: ["09L", "09R"] },
    { headingDeg: 270, label: "27", idents: ["27L", "27R"] },
  ],
};

export function landingDirectionsFor(icao: string): readonly LandingDirection[] {
  return LANDING_DIRECTIONS[icao.trim().toUpperCase()] ?? [];
}
