/**
 * Words and tone for the Upcoming table.
 *
 * The status is the operator's own, passed through from AeroDataBox, so the
 * vocabulary is theirs: "Expected", "Delayed", "CanceledUncertain". This turns it
 * into something readable and into one of a few tones the table can colour by,
 * without inventing a status the schedule never claimed.
 */

/** How a status should read on the board, not what the vendor called it. */
export type StatusTone = "expected" | "delayed" | "cancelled" | "arrived" | "unknown";

const TONES: ReadonlyArray<{ match: RegExp; tone: StatusTone }> = [
  // Cancelled first: "CanceledUncertain" is still a cancellation.
  { match: /cancel/i, tone: "cancelled" },
  { match: /divert/i, tone: "cancelled" },
  { match: /delay/i, tone: "delayed" },
  { match: /arrived|landed/i, tone: "arrived" },
  { match: /expected|enroute|en route|approach|boarding|departed|checkin|gateclosed/i, tone: "expected" },
];

/** Known vendor spellings that do not survive a mechanical tidy-up. */
const LABELS: Readonly<Record<string, string>> = {
  enroute: "En route",
  checkin: "Check-in",
  gateclosed: "Gate closed",
  canceled: "Cancelled",
  cancelled: "Cancelled",
  canceleduncertain: "Cancelled",
  unknown: "Unknown",
};

export function statusTone(status: string | null): StatusTone {
  if (!status) return "unknown";
  return TONES.find((entry) => entry.match.test(status))?.tone ?? "unknown";
}

/**
 * "CanceledUncertain" becomes "Cancelled", "EnRoute" becomes "En route". An
 * unrecognised status is split on its capitals rather than dropped, so a new
 * vendor word still reads as words.
 */
export function statusLabel(status: string | null): string {
  if (!status) return "";
  const key = status.replace(/[\s_-]+/g, "").toLowerCase();
  const known = LABELS[key];
  if (known) return known;

  const spaced = status
    .replace(/[_-]+/g, " ")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Where the flight is coming from, in the space a table column has: the city or
 * airport name, with its code beneath. Returns null when the schedule gave
 * neither, so the cell renders empty rather than "null".
 */
export function originOf(
  origin: { icao: string | null; iata: string | null; name: string | null } | null,
): { name: string; code: string | null } | null {
  if (!origin) return null;
  const code = origin.iata ?? origin.icao;
  const name = origin.name?.trim();
  if (name) return { name, code };
  return code ? { name: code, code: null } : null;
}

/** Minutes until arrival, negative once it is past. */
export function minutesUntil(iso: string, now: number = Date.now()): number {
  return Math.round((new Date(iso).getTime() - now) / 60_000);
}
