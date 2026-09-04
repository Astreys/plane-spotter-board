/**
 * Callsign -> route cache, filled in the background.
 *
 * The poller never waits on this. It asks for what is already known, hands the
 * unknown callsigns over, and moves on; anything looked up now shows on the next
 * tick, 15 seconds later. That keeps the board's own refresh independent of a
 * second upstream, which is the whole reason the poll is fast and predictable.
 *
 * Routes are effectively static — a callsign flies the same city pair every day —
 * so hits cache for a day. Misses cache too, and for a good while: most of the
 * general-aviation traffic on a board will never have a route, and re-asking
 * every 15 seconds would be pure waste.
 */

import { fetchRoute, type RouteLookup } from "./client.js";
import type { FlightRoute } from "../types.js";

/** Injected so the caching and queueing logic can be tested without HTTP. */
export type RouteLookupFn = (callsign: string) => Promise<RouteLookup>;

const HIT_TTL_MS = 24 * 60 * 60_000;
const MISS_TTL_MS = 6 * 60 * 60_000;
/** Plenty for any realistic board; keeps a long-running process bounded. */
const MAX_ENTRIES = 5_000;
/** Never let a burst of new callsigns queue without limit. */
const MAX_QUEUE = 200;

interface Entry {
  route: FlightRoute | null;
  expiresAt: number;
}

export interface RouteResolverLogger {
  warn(message: string, data?: Record<string, unknown>): void;
}

export class RouteResolver {
  private readonly cache = new Map<string, Entry>();
  private readonly queue: string[] = [];
  private readonly queued = new Set<string>();
  private draining = false;
  private stopped = false;

  constructor(
    private readonly log?: RouteResolverLogger,
    private readonly lookup: RouteLookupFn = fetchRoute,
  ) {}

  stop(): void {
    this.stopped = true;
    this.queue.length = 0;
    this.queued.clear();
  }

  /**
   * What we know right now. `null` means "asked, and there is no route" as well as
   * "not asked yet" — the caller cannot act differently on those, and collapsing
   * them keeps the row rendering simple.
   */
  get(callsign: string | null): FlightRoute | null {
    if (!callsign) return null;
    const key = callsign.trim().toUpperCase();
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return entry.route;
  }

  /** Queue any callsign we have no fresh answer for. Returns immediately. */
  ensure(callsigns: Array<string | null>): void {
    if (this.stopped) return;
    const now = Date.now();

    for (const callsign of callsigns) {
      if (!callsign) continue;
      const key = callsign.trim().toUpperCase();
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
          this.log?.warn("route lookup failed", { callsign: key, error: result.message });
          continue;
        }

        this.write(key, result.status === "found" ? result.route : null);
      }
    } finally {
      this.draining = false;
    }
  }

  private write(key: string, route: FlightRoute | null): void {
    if (this.cache.size >= MAX_ENTRIES) {
      // Map preserves insertion order, so the first key is the oldest write.
      const oldest = this.cache.keys().next();
      if (!oldest.done) this.cache.delete(oldest.value);
    }
    this.cache.set(key, {
      route,
      expiresAt: Date.now() + (route ? HIT_TTL_MS : MISS_TTL_MS),
    });
  }

  /** For the health endpoint and tests. */
  stats(): { cached: number; queued: number } {
    return { cached: this.cache.size, queued: this.queue.length };
  }
}
