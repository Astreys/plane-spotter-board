/**
 * Eyeball helper for milestone 1: run the inbound rules over a fixture (or a live
 * pull) and print the board plus the rejection reasons. This is how you check the
 * detection against what is actually landing, without a browser.
 *
 *   npx tsx scripts/inspect.ts                  # live pull for CYYZ
 *   npx tsx scripts/inspect.ts test/fixtures/yyz-live.json
 */

import fs from "node:fs";
import { fetchPoint } from "../src/adsb/client.js";
import { findAirport } from "../src/config/airports.js";
import type { RawSnapshot } from "../src/adsb/types.js";
import { judge, normalize, selectInbound } from "../src/domain/inbound.js";

const file = process.argv[2];
const airport = findAirport(process.env.AIRPORT ?? "CYYZ")!;

const snapshot: RawSnapshot = file
  ? (JSON.parse(fs.readFileSync(file, "utf8")) as RawSnapshot)
  : (await fetchPoint({ lat: airport.lat, lon: airport.lon, radiusNm: 60 })).snapshot;

const raw = snapshot.ac ?? [];
const reasons = new Map<string, number>();

for (const entry of raw) {
  const ac = normalize(entry);
  if (!ac) {
    reasons.set("unusable record", (reasons.get("unusable record") ?? 0) + 1);
    continue;
  }
  const verdict = judge(ac, airport);
  const key = verdict.inbound ? "INBOUND" : verdict.reason!;
  reasons.set(key, (reasons.get(key) ?? 0) + 1);
}

const inbound = selectInbound(raw, airport);

console.log(`${airport.icao} — ${raw.length} aircraft in radius, ${inbound.length} inbound\n`);
console.log("min  type  callsign  reg       alt     gs   vs      dist  from  categories");
for (const ac of inbound) {
  console.log(
    [
      String(ac.minutesOut ?? "?").padStart(3),
      (ac.type ?? "----").padEnd(5),
      (ac.callsign ?? "-").padEnd(9),
      (ac.registration ?? "-").padEnd(9),
      String(ac.altitudeFt ?? "-").padStart(6),
      String(ac.groundSpeedKt ?? "-").padStart(5),
      String(ac.verticalRateFpm ?? "-").padStart(6),
      `${ac.distanceNm}nm`.padStart(8),
      ac.fromDirection.padEnd(4),
      ac.categories.join(","),
    ].join("  "),
  );
}

console.log("\nverdicts:");
for (const [reason, count] of [...reasons].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(3)}  ${reason}`);
}
