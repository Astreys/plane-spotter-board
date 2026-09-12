/**
 * Mode S address -> airframe record, filled in the background.
 *
 * Same shape and the same reasoning as RouteResolver next door: the poller asks
 * for what is already known, hands over what is not, and never waits. A newly
 * seen aircraft gains its details on the next tick, 15 seconds later.
 *
 * What this is for: the feed often carries no type code, and a row with no type
 * lands in OTHER reading "Unknown type" even when it is a widebody. adsbdb knows
 * the airframe from its Mode S address, so the type arrives a tick later and the
 * aircraft is classified properly. It also names the registered operator, which
 * is how an airline gets onto a row before - or without - a route lookup.
 *
 * Airframe records are about as static as data gets: a registration and an
 * airframe outlive most software, so hits cache for a week. Misses cache for a
 * day, because a Mode S address adsbdb does not know today it will probably not
 * know tomorrow either.
 */

import { fetchAircraft, type AircraftLookup } from "./client.js";
import type { AircraftRecord } from "../types.js";

/** Injected so the caching and queueing can be tested without HTTP. */
export type AircraftLookupFn = (hex: string) => Promise<AircraftLookup>;

const HIT_TTL_MS = 7 * 24 * 60 * 60_000;
const MISS_TTL_MS = 24 * 60 * 60_000;
/** Plenty for any realistic board; keeps a long-running process bounded. */
const MAX_ENTRIES = 5_000;
/** Never let a burst of new aircraft queue without limit. */
const MAX_QUEUE = 200;

interface Entry {
  record: AircraftRecord | null;
  expiresAt: number;
}

export interface AircraftResolverLogger {
  warn(message: string, data?: Record<string, unknown>): void;
}

export class AircraftResolver {
  private readonly cache = new Map<string, Entry>();
  private readonly queue: string[] = [];
  private readonly queued = new Set<string>();
  private draining = false;
  private stopped = false;

  constructor(
    private readonly log?: AircraftResolverLogger,
    private readonly lookup: AircraftLookupFn = fetchAircraft,
  ) {}

  stop(): void {
    this.stopped = true;
    this.queue.length = 0;
    this.queued.clear();
  }

  /**
   * What we know right now. `null` covers both "asked, and adsbdb has nothing"
   * and "not asked yet" — the row renders the same either way.
   */
  get(hex: string | null): AircraftRecord | null {
    if (!hex) return null;
    const key = hex.trim().toLowerCase();
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return entry.record;
  }

  /** Queue any address we have no fresh answer for. Returns immediately. */
  ensure(hexes: Array<string | null>): void {
    if (this.stopped) return;
    const now = Date.now();

    for (const hex of hexes) {
      if (!hex) continue;
      const key = hex.trim().toLowerCase();
      if (!key || this.queued.has(key)) continue;

      const entry = this.cache.get(key);
      if (entry && entry.expiresAt >= now) continue;

      if (this.queue.length >= MAX_QUEUE) break;
      this.queue.push(key);
      this.queued.add(key);
    }

    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.draining || this.stopped) return;
    this.draining = true;

    try {
      while (this.queue.length > 0 && !this.stopped) {
        const key = this.queue.shift()!;
        this.queued.delete(key);

        const result = await this.lookup(key);
        if (result.status === "error") {
          // Leave it uncached so the next poll retries, but do not spin on it now.
          this.log?.warn("aircraft lookup failed", { hex: key, error: result.message });
          continue;
        }

        this.write(key, result.status === "found" ? result.aircraft : null);
      }
    } finally {
      this.draining = false;
    }
  }

  private write(key: string, record: AircraftRecord | null): void {
    if (this.cache.size >= MAX_ENTRIES) {
      // Map preserves insertion order, so the first key is the oldest write.
      const oldest = this.cache.keys().next();
      if (!oldest.done) this.cache.delete(oldest.value);
    }
    this.cache.set(key, {
      record,
      expiresAt: Date.now() + (record ? HIT_TTL_MS : MISS_TTL_MS),
    });
  }

  /** For the health endpoint and tests. */
  stats(): { cached: number; queued: number } {
    return { cached: this.cache.size, queued: this.queue.length };
  }
}
