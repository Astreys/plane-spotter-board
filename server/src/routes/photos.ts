import type { FastifyInstance } from "fastify";
import { config } from "../config/env.js";

/**
 * Thin cached proxy for planespotters.net photos (free, non-commercial, no key).
 *
 * Server-side so that a hundred phones on the board do not each hammer the photo
 * API, and so misses are remembered — most hexes have no photo and asking again
 * every render is pure waste. Photos are decoration: every failure returns 200
 * with `photo: null` so a row never breaks over one.
 */

interface Params {
  hex: string;
}

export interface PhotoDto {
  hex: string;
  photo: {
    thumbnail: string;
    large: string;
    photographer: string | null;
    link: string;
  } | null;
}

const HIT_TTL_MS = 24 * 60 * 60_000;
const MISS_TTL_MS = 60 * 60_000;
const MAX_ENTRIES = 5_000;

interface Entry {
  value: PhotoDto;
  expiresAt: number;
}

const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<PhotoDto>>();

function readCache(hex: string): PhotoDto | undefined {
  const entry = cache.get(hex);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    cache.delete(hex);
    return undefined;
  }
  return entry.value;
}

function writeCache(hex: string, value: PhotoDto): void {
  if (cache.size >= MAX_ENTRIES) {
    // Cheap eviction: drop the oldest insertion. Map preserves insertion order.
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(hex, {
    value,
    expiresAt: Date.now() + (value.photo ? HIT_TTL_MS : MISS_TTL_MS),
  });
}

export function registerPhotoRoutes(app: FastifyInstance): void {
  app.get<{ Params: Params }>("/api/photo/:hex", async (request, reply) => {
    const hex = request.params.hex.trim().toLowerCase();
    if (!/^[0-9a-f]{6}$/.test(hex)) {
      return reply.code(400).send({ error: "hex must be 6 hex digits" });
    }

    const cached = readCache(hex);
    if (cached) {
      reply.header("Cache-Control", "public, max-age=86400");
      return cached;
    }

    // Collapse concurrent requests for the same aircraft into one upstream call.
    let pending = inFlight.get(hex);
    if (!pending) {
      pending = fetchPhoto(hex).finally(() => inFlight.delete(hex));
      inFlight.set(hex, pending);
    }

    const result = await pending;
    reply.header("Cache-Control", "public, max-age=3600");
    return result;
  });
}

async function fetchPhoto(hex: string): Promise<PhotoDto> {
  const empty: PhotoDto = { hex, photo: null };

  try {
    const response = await fetch(`https://api.planespotters.net/pub/photos/hex/${hex}`, {
      headers: { "User-Agent": config.userAgent, Accept: "application/json" },
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });
    if (!response.ok) {
      writeCache(hex, empty);
      return empty;
    }

    const body = (await response.json()) as {
      photos?: Array<{
        thumbnail_large?: { src?: string };
        thumbnail?: { src?: string };
        photographer?: string;
        link?: string;
      }>;
    };

    const first = body.photos?.[0];
    const thumb = first?.thumbnail_large?.src ?? first?.thumbnail?.src;
    if (!first || !thumb) {
      writeCache(hex, empty);
      return empty;
    }

    const dto: PhotoDto = {
      hex,
      photo: {
        thumbnail: first.thumbnail?.src ?? thumb,
        large: thumb,
        photographer: first.photographer ?? null,
        link: first.link ?? `https://www.planespotters.net/hex/${hex.toUpperCase()}`,
      },
    };
    writeCache(hex, dto);
    return dto;
  } catch {
    // Network hiccup: cache the miss briefly so one flaky minute does not turn
    // into a retry storm from every open board.
    writeCache(hex, empty);
    return empty;
  }
}
