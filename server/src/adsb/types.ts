/**
 * Raw shapes from the ADS-B aggregators (ADSBExchange v2 compatible).
 *
 * Everything is optional on purpose. The upstream is a community feed of whatever
 * receivers happened to decode; treat every field as absent until proven otherwise.
 */

export interface RawAircraft {
  hex?: string;
  type?: string;
  /** Callsign, space-padded. Always trim. */
  flight?: string;
  /** Registration. */
  r?: string;
  /** ICAO type designator. */
  t?: string;
  /** Barometric altitude in feet, or the string "ground". */
  alt_baro?: number | string;
  alt_geom?: number;
  /** Ground speed, knots. */
  gs?: number;
  /** True track over ground, degrees. */
  track?: number;
  /** Vertical rate, feet per minute. Negative is descending. */
  baro_rate?: number;
  geom_rate?: number;
  lat?: number;
  lon?: number;
  /** Seconds since the position was last updated. */
  seen_pos?: number;
  seen?: number;
  squawk?: string;
  emergency?: string;
  category?: string;
  /** Distance from the query point in nautical miles. Not always present. */
  dst?: number;
  /** Bearing from the query point in degrees. Not always present. */
  dir?: number;
  [key: string]: unknown;
}

export interface RawSnapshot {
  ac?: RawAircraft[];
  now?: number;
  total?: number;
  [key: string]: unknown;
}
