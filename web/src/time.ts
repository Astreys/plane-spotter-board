/**
 * Clock formatting for the masthead.
 *
 * The board watches airports in four time zones, so "22:48" has to mean local
 * time at the field being watched rather than wherever the browser is sitting.
 * Everything here formats in the airport's zone and never in the viewer's.
 */

export interface AirportTime {
  /** 24-hour clock, e.g. "22:48". Aviation is 24-hour everywhere. */
  time: string;
  /** e.g. "Thu, Sep 10, 2026". */
  date: string;
  /** Short zone label, e.g. "EDT". Empty when the runtime will not name one. */
  zone: string;
}

/** What the masthead shows before the first snapshot names a time zone. */
const UNKNOWN: AirportTime = { time: "--:--", date: "", zone: "" };

/**
 * `timeZone` is whatever the snapshot carried, so it can be null (no data yet) or
 * an IANA name this runtime does not know. Intl throws a RangeError on the
 * latter; a broken clock must not take the header down with it.
 */
export function formatAirportTime(at: Date, timeZone: string | null): AirportTime {
  if (!timeZone) return UNKNOWN;

  try {
    const time = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(at);

    const date = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(at);

    const zone =
      new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
        .formatToParts(at)
        .find((part) => part.type === "timeZoneName")?.value ?? "";

    return { time, date, zone };
  } catch {
    return UNKNOWN;
  }
}
