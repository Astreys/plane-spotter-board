/**
 * METAR, translated.
 *
 * aviationweather.gov already decodes the report into JSON, but it stays in the
 * language of pilots: cloud as FEW/SCT/BKN/OVC layers, weather as "-SHRA" or
 * "VCSH", visibility in statute miles with "10+" meaning "at least ten". This is
 * the one place that turns it into what the card says - the same job
 * schedule/model-codes.ts does for the schedule's aircraft names - so the
 * frontend ships no METAR knowledge at all.
 *
 * Humidity is not in a METAR. It follows exactly from temperature and dewpoint,
 * which are.
 */

import { compassPoint } from "../domain/geo.js";
import type { CloudCover, WeatherIcon, WeatherObservation } from "../types.js";
import type { RawMetar } from "./client.js";

/**
 * Stored without `isDay`: that depends on when the card is read, not on when the
 * report was issued, and an hour-old report can straddle sunset.
 */
export type ParsedObservation = Omit<WeatherObservation, "isDay">;

interface Layer {
  cover: CloudCover;
  baseFt: number;
}

const KM_PER_STATUTE_MILE = 1.609344;

/** Coverage in eighths, roughly: FEW 1-2, SCT 3-4, BKN 5-7, OVC 8. OVX is sky obscured. */
const COVER_RANK: Record<CloudCover, number> = { FEW: 1, SCT: 2, BKN: 3, OVC: 4, OVX: 4 };
const COVERS = new Set<string>(Object.keys(COVER_RANK));

/** Indexed by the highest cover rank present. */
const SKY: ReadonlyArray<{ words: string; icon: WeatherIcon }> = [
  { words: "Clear", icon: "clear" },
  { words: "Mostly clear", icon: "mostly-clear" },
  { words: "Partly cloudy", icon: "partly-cloudy" },
  { words: "Mostly cloudy", icon: "mostly-cloudy" },
  { words: "Overcast", icon: "overcast" },
];

interface Phenomenon {
  match: RegExp;
  words: string;
  icon: WeatherIcon;
  /** Whether "light" and "heavy" make sense for it. Nobody says "light fog". */
  graded: boolean;
}

/**
 * First match wins, so the more significant and the more specific come first: a
 * thunderstorm outranks the rain it brings, freezing rain outranks rain, and snow
 * outranks the mist that often comes with it.
 */
const PHENOMENA: readonly Phenomenon[] = [
  { match: /FC/, words: "Funnel cloud", icon: "thunder", graded: false },
  { match: /TS/, words: "Thunderstorm", icon: "thunder", graded: false },
  { match: /FZRA/, words: "Freezing rain", icon: "rain", graded: true },
  { match: /FZDZ/, words: "Freezing drizzle", icon: "rain", graded: true },
  { match: /SHSN/, words: "Snow showers", icon: "snow", graded: true },
  { match: /SN|SG/, words: "Snow", icon: "snow", graded: true },
  { match: /PL/, words: "Ice pellets", icon: "snow", graded: true },
  { match: /GR|GS/, words: "Hail", icon: "snow", graded: true },
  { match: /SHRA/, words: "Rain showers", icon: "showers", graded: true },
  // Bare SH only ever appears as VCSH: showers nearby, kind unspecified.
  { match: /^SH$/, words: "Showers", icon: "showers", graded: false },
  { match: /RA/, words: "Rain", icon: "rain", graded: true },
  { match: /DZ/, words: "Drizzle", icon: "rain", graded: true },
  { match: /FZFG/, words: "Freezing fog", icon: "fog", graded: false },
  { match: /BCFG|MIFG|PRFG/, words: "Fog patches", icon: "fog", graded: false },
  { match: /FG/, words: "Fog", icon: "fog", graded: false },
  { match: /BR/, words: "Mist", icon: "fog", graded: false },
  { match: /DS|SS/, words: "Dust storm", icon: "haze", graded: false },
  { match: /HZ/, words: "Haze", icon: "haze", graded: false },
  { match: /FU/, words: "Smoke", icon: "haze", graded: false },
  { match: /DU|SA/, words: "Dust", icon: "haze", graded: false },
  { match: /UP/, words: "Precipitation", icon: "rain", graded: true },
];

const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** Relative humidity from temperature and dewpoint (Magnus, Alduchov-Eskridge constants). */
export function relativeHumidity(temperatureC: number, dewpointC: number): number {
  const a = 17.625;
  const b = 243.04;
  const saturation = (t: number): number => Math.exp((a * t) / (b + t));
  const rh = (100 * saturation(dewpointC)) / saturation(temperatureC);
  return Math.round(Math.min(100, Math.max(0, rh)));
}

/**
 * Statute miles, as a number or as a floor like "10+" - and "6+", which is how the
 * feed renders the ICAO "9999", ten kilometres or more. The floor is kept, so the
 * card can say "at least" instead of inventing a precise figure.
 */
export function parseVisibility(raw: number | string | null | undefined): {
  km: number | null;
  orMore: boolean;
} {
  if (raw === null || raw === undefined) return { km: null, orMore: false };
  const text = String(raw).trim();
  const miles = Number.parseFloat(text);
  if (!Number.isFinite(miles)) return { km: null, orMore: false };
  return { km: Math.round(miles * KM_PER_STATUTE_MILE * 10) / 10, orMore: text.endsWith("+") };
}

export function parseWind(raw: RawMetar): WeatherObservation["wind"] {
  const speedKt = finite(raw.wspd);
  if (speedKt === null) return null;

  const gust = finite(raw.wgst);
  const gustKt = gust !== null && gust > speedKt ? gust : null;

  if (speedKt === 0) {
    return { directionDeg: null, fromCompass: null, speedKt: 0, gustKt: null, variable: false, calm: true };
  }

  const directionDeg = finite(raw.wdir);
  // "VRB", or a speed with no direction at all: either way there is no one side it comes from.
  if (directionDeg === null) {
    return { directionDeg: null, fromCompass: null, speedKt, gustKt, variable: true, calm: false };
  }

  return {
    directionDeg,
    fromCompass: compassPoint(directionDeg),
    speedKt,
    gustKt,
    variable: false,
    calm: false,
  };
}

function layersOf(raw: RawMetar): Layer[] {
  const layers: Layer[] = [];
  for (const layer of raw.clouds ?? []) {
    const cover = layer.cover?.trim().toUpperCase();
    // CLR, SKC, NCD, NSC and CAVOK carry no base: they describe the absence of a layer.
    if (!cover || !COVERS.has(cover) || typeof layer.base !== "number") continue;
    layers.push({ cover: cover as CloudCover, baseFt: layer.base });
  }
  return layers.sort((a, b) => a.baseFt - b.baseFt);
}

/**
 * The ceiling - the lowest broken or overcast layer - when there is one, because
 * that is the layer an approach actually disappears into; scattered wisps below
 * it do not hide an aircraft. Without a ceiling, the lowest layer of any kind, so
 * the card still says how high the cloud sits.
 */
export function cloudBase(layers: readonly Layer[]): Layer | null {
  return layers.find((layer) => COVER_RANK[layer.cover] >= 3) ?? layers[0] ?? null;
}

function describeSky(layers: readonly Layer[]): { words: string; icon: WeatherIcon } {
  // OVX is a vertical visibility: the sky cannot be seen at all, usually through fog.
  if (layers.some((layer) => layer.cover === "OVX")) return { words: "Sky obscured", icon: "fog" };
  const rank = Math.max(0, ...layers.map((layer) => COVER_RANK[layer.cover]));
  return SKY[rank]!;
}

interface WeatherToken {
  code: string;
  intensity: "light" | "heavy" | null;
  nearby: boolean;
}

function tokensOf(wx: string | null | undefined): WeatherToken[] {
  return (wx ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      let code = token.toUpperCase();
      let intensity: WeatherToken["intensity"] = null;
      if (code.startsWith("-")) {
        intensity = "light";
        code = code.slice(1);
      } else if (code.startsWith("+")) {
        intensity = "heavy";
        code = code.slice(1);
      }
      const nearby = code.startsWith("VC");
      return { code: nearby ? code.slice(2) : code, intensity, nearby };
    });
}

/**
 * Weather at the field outranks weather nearby, whatever its kind. A "nearby"
 * phenomenon gets no icon of its own: drawing rain over an airport where it is
 * not raining would be the card lying.
 */
function describeWeather(
  wx: string | null | undefined,
): { words: string; icon: WeatherIcon | null } | null {
  const tokens = tokensOf(wx);

  for (const nearby of [false, true]) {
    for (const phenomenon of PHENOMENA) {
      const hit = tokens.find((token) => token.nearby === nearby && phenomenon.match.test(token.code));
      if (!hit) continue;

      if (nearby) return { words: `${phenomenon.words} nearby`, icon: null };

      const grade =
        phenomenon.graded && hit.intensity ? (hit.intensity === "light" ? "Light" : "Heavy") : null;
      return {
        words: grade ? `${grade} ${phenomenon.words.toLowerCase()}` : phenomenon.words,
        icon: phenomenon.icon,
      };
    }
  }
  return null;
}

/** One report into our shape. Null when it has no observation time to anchor it. */
export function toObservation(raw: RawMetar): ParsedObservation | null {
  const obsTime = finite(raw.obsTime);
  if (obsTime === null) return null;

  const temperatureC = finite(raw.temp);
  const dewpointC = finite(raw.dewp);
  const layers = layersOf(raw);
  const sky = describeSky(layers);
  const weather = describeWeather(raw.wxString);
  const visibility = parseVisibility(raw.visib);

  return {
    observedAt: new Date(obsTime * 1000).toISOString(),
    temperatureC,
    dewpointC,
    humidityPct:
      temperatureC !== null && dewpointC !== null ? relativeHumidity(temperatureC, dewpointC) : null,
    wind: parseWind(raw),
    visibilityKm: visibility.km,
    visibilityOrMore: visibility.orMore,
    cloudBase: cloudBase(layers),
    condition: weather?.words ?? sky.words,
    icon: weather?.icon ?? sky.icon,
    raw: raw.rawOb?.trim() ?? "",
  };
}
