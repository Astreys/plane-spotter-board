/**
 * Words for the weather card.
 *
 * The server has already translated METAR into plain values - "Partly cloudy",
 * degrees, kilometres - so what is left here is only presentation: units,
 * rounding, and saying "at least" when a station reported a floor.
 *
 * Wind is in knots to match the board beside it, which already speaks in feet
 * and nautical miles.
 */

import type { WeatherObservation } from "./api";

type CloudCover = NonNullable<WeatherObservation["cloudBase"]>["cover"];

const COVER_WORDS: Record<CloudCover, string> = {
  FEW: "Few",
  SCT: "Scattered",
  BKN: "Broken",
  OVC: "Overcast",
  OVX: "Obscured",
};

export function formatTemperature(celsius: number | null): string {
  if (celsius === null) return "--";
  const rounded = Math.round(celsius);
  // Math.round(-0.4) is -0, which would print as "-0°C".
  return `${rounded === 0 ? 0 : rounded}°C`;
}

/**
 * "WNW 6 kt", "WNW 16 kt, gusting 23", "Variable 3 kt", "Calm". Direction leads
 * because it is the useful half: it decides which runway is in use.
 */
export function formatWind(wind: WeatherObservation["wind"]): string {
  if (!wind) return "--";
  if (wind.calm) return "Calm";
  const base =
    wind.variable || !wind.fromCompass
      ? `Variable ${wind.speedKt} kt`
      : `${wind.fromCompass} ${wind.speedKt} kt`;
  return wind.gustKt ? `${base}, gusting ${wind.gustKt}` : base;
}

/** A floor stays a floor: "10+ km", never a precise-looking 9.7. */
export function formatVisibility(km: number | null, orMore: boolean): string {
  if (km === null) return "--";
  if (orMore) return `${Math.round(km)}+ km`;
  if (km < 10) return `${Number(km.toFixed(1))} km`;
  return `${Math.round(km)} km`;
}

/** "Broken 900 ft". No layer at all reads as a clear sky. */
export function formatCloudBase(base: WeatherObservation["cloudBase"]): string {
  if (!base) return "Clear";
  return `${COVER_WORDS[base.cover]} ${base.baseFt.toLocaleString("en-US")} ft`;
}

export function formatHumidity(percent: number | null): string {
  return percent === null ? "--" : `${percent}%`;
}

/** How old the report is, counted from when the station observed it. */
export function formatReportAge(seconds: number | null): string {
  if (seconds === null) return "";
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min ago`;
  return `${Math.round(minutes / 60)} h ago`;
}
