/**
 * Airport registry. YYZ is where we started, but nothing downstream may assume it —
 * the poller, the routes and the frontend all take an ICAO code.
 */

export interface Airport {
  /** ICAO code, uppercase. This is the key everywhere. */
  icao: string;
  iata: string;
  name: string;
  city: string;
  lat: number;
  lon: number;
  /** Field elevation in feet, used to keep the altitude rules honest. */
  elevationFt: number;
  timeZone: string;
}

export const AIRPORTS: readonly Airport[] = [
  {
    icao: "CYYZ",
    iata: "YYZ",
    name: "Toronto Pearson International",
    city: "Toronto",
    lat: 43.6777,
    lon: -79.6248,
    elevationFt: 569,
    timeZone: "America/Toronto",
  },
  {
    icao: "CYYC",
    iata: "YYC",
    name: "Calgary International",
    city: "Calgary",
    lat: 51.1139,
    lon: -114.0203,
    elevationFt: 3557,
    timeZone: "America/Edmonton",
  },
  {
    icao: "CYVR",
    iata: "YVR",
    name: "Vancouver International",
    city: "Vancouver",
    lat: 49.1939,
    lon: -123.1844,
    elevationFt: 14,
    timeZone: "America/Vancouver",
  },
  {
    icao: "KJFK",
    iata: "JFK",
    name: "John F. Kennedy International",
    city: "New York",
    lat: 40.6398,
    lon: -73.7789,
    elevationFt: 13,
    timeZone: "America/New_York",
  },
  {
    icao: "EGLL",
    iata: "LHR",
    name: "London Heathrow",
    city: "London",
    lat: 51.4775,
    lon: -0.4614,
    elevationFt: 83,
    timeZone: "Europe/London",
  },
];

const BY_ICAO = new Map(AIRPORTS.map((a) => [a.icao, a]));
const BY_IATA = new Map(AIRPORTS.map((a) => [a.iata, a]));

/** Accepts ICAO or IATA, any case. Returns undefined for anything unknown. */
export function findAirport(code: string): Airport | undefined {
  const key = code.trim().toUpperCase();
  return BY_ICAO.get(key) ?? BY_IATA.get(key);
}
