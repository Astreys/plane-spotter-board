import { config } from "../config/env.js";
import { RateGate } from "../util/rate-gate.js";
import type { RawSnapshot } from "./types.js";

/**
 * Aggregator hosts, in preference order. All three speak the same v2 API, so a
 * failure just means trying the next one.
 */
export const ADSB_HOSTS = [
  "https://api.adsb.lol",
  "https://api.adsb.fi",
  "https://api.adsb.one",
] as const;

export const ATTRIBUTION = {
  label: "ADS-B data by adsb.lol / adsb.fi / adsb.one",
  url: "https://adsb.lol",
  note: "Community ADS-B aggregators. Non-commercial use.",
} as const;

export class AdsbError extends Error {
  constructor(
    message: string,
    readonly host: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AdsbError";
  }
}

/**
 * The single global gate in front of every aggregator request. Every poller
 * shares this one instance, so no matter how many airports are tracked we never
 * exceed one request per `minRequestSpacingMs`. Requests queue, never drop.
 *
 * Other upstreams - the route database, the photo API - are separate services
 * with their own published limits. They hold their own gates rather than
 * borrowing this budget, which is reserved for the aggregators.
 */
const gate = new RateGate(config.minRequestSpacingMs);

export interface FetchResult {
  snapshot: RawSnapshot;
  host: string;
  fetchedAt: number;
  durationMs: number;
}

/**
 * Fetch one point query, trying hosts in order starting at `startIndex`.
 * Rate-limited globally. Throws AdsbError only when every host failed.
 */
export async function fetchPoint(params: {
  lat: number;
  lon: number;
  radiusNm: number;
  startIndex?: number;
  signal?: AbortSignal;
}): Promise<FetchResult> {
  const { lat, lon, radiusNm } = params;
  const radius = Math.max(1, Math.min(Math.round(radiusNm), 250));
  const start = params.startIndex ?? 0;
  const errors: string[] = [];

  for (let offset = 0; offset < ADSB_HOSTS.length; offset += 1) {
    const host = ADSB_HOSTS[(start + offset) % ADSB_HOSTS.length]!;
    const url = `${host}/v2/point/${lat}/${lon}/${radius}`;

    try {
      return await gate.run(() => requestOnce(url, host, params.signal));
    } catch (error) {
      errors.push(`${host}: ${(error as Error).message}`);
    }
  }

  throw new AdsbError(`all hosts failed — ${errors.join("; ")}`, "all");
}

async function requestOnce(
  url: string,
  host: string,
  signal?: AbortSignal,
): Promise<FetchResult> {
  const startedAt = Date.now();
  const timeout = AbortSignal.timeout(config.requestTimeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  const response = await fetch(url, {
    headers: {
      "User-Agent": config.userAgent,
      Accept: "application/json",
    },
    signal: combined,
  });

  if (!response.ok) {
    throw new AdsbError(`HTTP ${response.status}`, host, response.status);
  }

  const body = (await response.json()) as unknown;
  if (typeof body !== "object" || body === null) {
    throw new AdsbError("response was not a JSON object", host);
  }

  return {
    snapshot: body as RawSnapshot,
    host,
    fetchedAt: Date.now(),
    durationMs: Date.now() - startedAt,
  };
}

/** Index of a host in the rotation, for resuming after a failure. */
export function hostIndex(host: string): number {
  const index = ADSB_HOSTS.indexOf(host as (typeof ADSB_HOSTS)[number]);
  return index === -1 ? 0 : index;
}
