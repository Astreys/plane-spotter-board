/**
 * Which way the airport is landing.
 *
 * The runway in use is the single most useful fact a spotter can be told, because
 * it decides where to stand — and nobody publishes it for free. It is, however,
 * written in the sky: an aircraft a minute from touchdown is lined up on the
 * centreline, so its ground track *is* the landing direction.
 *
 * That is the whole method. Aircraft close to landing are believed; aircraft
 * further out are used only when nothing is close, because they may still be
 * turning onto the approach. Tracks that match no runway at all are dropped
 * rather than averaged in — a measured attempt at this averaged an aircraft
 * mid-downwind, tracking 336, into a northeast flow and came out 13 degrees wrong.
 *
 * Nothing is inferred from wind. Wind suggests what an airport *would* prefer;
 * noise rules and traffic routinely override it, and a guess dressed as an
 * observation is worse than silence.
 */

import type { LandingDirection } from "../config/runways.js";
import type { InboundAircraft, LandingFlow } from "../types.js";
import { angleBetween, compassPoint } from "./geo.js";

export const FLOW_RULES = {
  /** Inside this, an aircraft is committed to a runway rather than manoeuvring. */
  finalMinutes: 3,
  finalDistanceNm: 8,
  /** The wider net, used only when nothing is on short final. */
  nearDistanceNm: 15,
  /** Above this (over field elevation) an aircraft is still being positioned. */
  maxHeightFt: 5_000,
  /**
   * How far a track may sit from a runway heading and still count as lined up.
   *
   * Tight on purpose. An aircraft on final tracks within a few degrees of the
   * centreline, while runway directions sit about 90 degrees apart — at 25
   * degrees half the compass counted as aligned, and an aircraft mid-vector on
   * 336 was read as landing on Pearson's 33 (317 true).
   */
  alignmentDeg: 15,
} as const;

const WORDS: Readonly<Record<string, string>> = {
  N: "north",
  NNE: "north-northeast",
  NE: "northeast",
  ENE: "east-northeast",
  E: "east",
  ESE: "east-southeast",
  SE: "southeast",
  SSE: "south-southeast",
  S: "south",
  SSW: "south-southwest",
  SW: "southwest",
  WSW: "west-southwest",
  W: "west",
  WNW: "west-northwest",
  NW: "northwest",
  NNW: "north-northwest",
};

/** Plain words for a compass point: "NE" reads as "northeast" in a sentence. */
export function compassWords(point: string): string {
  return WORDS[point] ?? point;
}

/** The runway direction an aircraft's track lines up with, if any does. */
export function alignedDirection(
  trackDeg: number,
  directions: readonly LandingDirection[],
): LandingDirection | null {
  let best: LandingDirection | null = null;
  // Annotated: FLOW_RULES is `as const`, so this would otherwise be typed 15.
  let bestOffset: number = FLOW_RULES.alignmentDeg;

  for (const direction of directions) {
    const offset = angleBetween(trackDeg, direction.headingDeg);
    if (offset <= bestOffset) {
      best = direction;
      bestOffset = offset;
    }
  }
  return best;
}

interface Vote {
  direction: LandingDirection;
  /** On short final, as opposed to merely low and close. */
  committed: boolean;
  /** How close the aircraft casting it is — the tie-breaker. */
  distanceNm: number;
}

function votesFrom(
  aircraft: readonly InboundAircraft[],
  directions: readonly LandingDirection[],
  elevationFt: number,
): Vote[] {
  const ceiling = elevationFt + FLOW_RULES.maxHeightFt;
  const votes: Vote[] = [];

  for (const item of aircraft) {
    if (item.trackDeg === null) continue;
    if (item.altitudeFt !== null && item.altitudeFt > ceiling) continue;
    if (item.distanceNm > FLOW_RULES.nearDistanceNm) continue;

    const direction = alignedDirection(item.trackDeg, directions);
    if (!direction) continue;

    const committed =
      item.distanceNm <= FLOW_RULES.finalDistanceNm ||
      (item.minutesOut !== null && item.minutesOut <= FLOW_RULES.finalMinutes);

    votes.push({ direction, committed, distanceNm: item.distanceNm });
  }

  return votes;
}

/**
 * The direction in use, or null when the sky cannot say.
 *
 * Null is a real answer and the UI must render it as silence: at 3am with one
 * helicopter about, nothing here is knowable, and inventing a direction would
 * send someone to the wrong side of the airport.
 */
export function inferLandingFlow(
  aircraft: readonly InboundAircraft[],
  directions: readonly LandingDirection[],
  elevationFt = 0,
): LandingFlow | null {
  if (directions.length === 0) return null;

  const all = votesFrom(aircraft, directions, elevationFt);
  if (all.length === 0) return null;

  // Aircraft about to land settle it; the rest are only consulted when none are.
  const committed = all.filter((vote) => vote.committed);
  const sample = committed.length > 0 ? committed : all;

  const tally = new Map<
    string,
    { direction: LandingDirection; count: number; nearestNm: number }
  >();
  for (const vote of sample) {
    const entry = tally.get(vote.direction.label);
    if (entry) {
      entry.count += 1;
      entry.nearestNm = Math.min(entry.nearestNm, vote.distanceNm);
    } else {
      tally.set(vote.direction.label, {
        direction: vote.direction,
        count: 1,
        nearestNm: vote.distanceNm,
      });
    }
  }

  /*
   * Most votes wins; a tie goes to whichever direction the aircraft nearest
   * touchdown is flying. Busy airports really do run crossing runways at once -
   * JFK landing 04 and 13 together produced a tie on a live board - and resolving
   * one by the order they happened to be tallied would be a coin toss wearing a
   * fact's clothes. The closest aircraft is the best evidence available.
   */
  const ranked = [...tally.values()].sort(
    (a, b) => b.count - a.count || a.nearestNm - b.nearestNm,
  );
  const winner = ranked[0]!;
  const contested = ranked.length > 1 && ranked[1]!.count === winner.count;

  const heading = winner.direction.headingDeg;
  const compass = compassPoint(heading);

  return {
    headingDeg: heading,
    label: winner.direction.label,
    idents: [...winner.direction.idents],
    compass,
    words: compassWords(compass),
    // Aircraft fly towards the airport from the opposite side: that is where to stand.
    approachFrom: compassWords(compassPoint(heading + 180)),
    sample: winner.count,
    // "firm" needs an aircraft actually committed to the runway, and no tie.
    confidence: committed.length > 0 && !contested ? "firm" : "likely",
  };
}

/**
 * Keeps the reported direction steady.
 *
 * A single poll is a snapshot of whatever happened to be in the sky, and airports
 * do change direction during the day — but a line that flickers between northeast
 * and southwest every fifteen seconds is worse than useless to someone deciding
 * where to drive. So a new direction has to hold for consecutive polls before it
 * is adopted, and a quiet spell keeps showing the last known one for a while
 * rather than blinking out the moment traffic thins.
 */
export class FlowTracker {
  private current: LandingFlow | null = null;
  private setAt = 0;
  private pending: { label: string; count: number } | null = null;

  constructor(
    /** Consecutive polls a different direction must survive before it is adopted. */
    private readonly confirmations = 2,
    /** How long a direction outlives the traffic that proved it. */
    private readonly ttlMs = 10 * 60_000,
  ) {}

  update(next: LandingFlow | null, now = Date.now()): LandingFlow | null {
    if (!next) {
      // Nothing to see. Hold the last answer briefly, then admit we do not know.
      if (this.current && now - this.setAt > this.ttlMs) this.current = null;
      return this.current;
    }

    if (!this.current || this.current.label === next.label) {
      this.current = next;
      this.setAt = now;
      this.pending = null;
      return this.current;
    }

    this.pending =
      this.pending?.label === next.label
        ? { label: next.label, count: this.pending.count + 1 }
        : { label: next.label, count: 1 };

    if (this.pending.count >= this.confirmations) {
      this.current = next;
      this.setAt = now;
      this.pending = null;
    }

    return this.current;
  }
}
