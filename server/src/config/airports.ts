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
  /**
   * The airport's own site, linked from the airport card. Optional: an entry
   * nobody has filled in renders no link rather than a dead one.
   */
  website?: string;
  /**
   * Hero artwork under web/public, e.g. "/airports/cyyz.webp". Unset everywhere
   * for now — the frontend draws a placeholder band from the ICAO code until
   * there is real artwork, so adding one here is the whole change.
   */
  heroImage?: string;
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
    website: "https://www.torontopearson.com",
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
    website: "https://www.yyc.com",
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
    website: "https://www.yvr.ca",
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
    website: "https://www.jfkairport.com",
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
    website: "https://www.heathrow.com",
  },
];

const BY_ICAO = new Map(AIRPORTS.map((a) => [a.icao, a]));
const BY_IATA = new Map(AIRPORTS.map((a) => [a.iata, a]));

/** Accepts ICAO or IATA, any case. Returns undefined for anything unknown. */
export function findAirport(code: string): Airport | undefined {
  const key = code.trim().toUpperCase();
  return BY_ICAO.get(key) ?? BY_IATA.get(key);
}
