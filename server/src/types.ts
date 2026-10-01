import type { CategoryId, GroupId } from "./config/aircraft-types.js";

export type { CategoryId, GroupId };

/** An airport at one end of a flight. Codes can be missing; both never are. */
export interface RouteAirport {
  iata: string | null;
  icao: string | null;
  name: string | null;
  city: string | null;
  countryIso: string | null;
}

/**
 * Where a flight is coming from and going to, by callsign.
 *
 * This is the callsign's *scheduled* route, not observed track history. For an
 * arrival the destination is normally the airport being watched; when it is not,
 * the aircraft is likely operating a different leg under the same callsign, so
 * the UI shows what the schedule says rather than guessing.
 */
export interface FlightRoute {
  origin: RouteAirport | null;
  destination: RouteAirport | null;
  airline: string | null;
  callsignIata: string | null;
  /** ICAO airline code, e.g. "ACA". The key an airline logo lookup wants. */
  airlineIcao: string | null;
  /** IATA airline code, e.g. "AC". */
  airlineIata: string | null;
  /**
   * Where the pair came from. "callsign" is adsbdb's canonical city pair for the
   * flight number, which is often a different leg; "schedule" is today's actual
   * arrival, taken from the airport's own schedule.
   */
  source: "callsign" | "schedule";
  /**
   * True when the scheduled destination is the airport being watched.
   *
   * Often it is not: the route database keys on callsign and returns a typical
   * city pair, which may be a different leg, a different day's schedule, or an
   * aircraft merely passing overhead. When this is false the pair is still shown,
   * but marked, because presenting it as this arrival's route would be a lie.
   */
  arrivesHere: boolean;
}

/**
 * What adsbdb knows about one airframe, by its Mode S address.
 *
 * This fills two gaps the live feed leaves: aircraft it reports with no type
 * code, which would otherwise sit in OTHER as "Unknown type", and the operator,
 * which is how an airline reaches a row before a route lookup lands.
 */
export interface AircraftRecord {
  /** ICAO type designator, e.g. "A21N". */
  type: string | null;
  /** adsbdb's own words, e.g. "A321 271NXSL". A fallback name, never a code. */
  model: string | null;
  manufacturer: string | null;
  /**
   * Registration as adsbdb has it. The feed's own registration wins when there is
   * one: adsbdb returns "CA-GKQL" for aircraft registered C-GKQL.
   */
  registration: string | null;
  /** Registered owner, e.g. "Turkish Airlines". */
  operator: string | null;
  /** ICAO code for that operator, e.g. "THY". Often null for private owners. */
  operatorIcao: string | null;
}

/** One aircraft on the board. Every optional field really can be missing. */
export interface InboundAircraft {
  /** ICAO 24-bit address, lowercase hex. The only field we can rely on. */
  hex: string;
  callsign: string | null;
  registration: string | null;
  /** ICAO type designator, uppercase, e.g. "B77W". Null when the feed omits it. */
  type: string | null;
  /** Friendly name when we know it, otherwise null — the UI shows `type` then. */
  typeName: string | null;

  altitudeFt: number | null;
  groundSpeedKt: number | null;
  verticalRateFpm: number | null;
  trackDeg: number | null;

  lat: number;
  lon: number;
  /** Distance from the airport, nautical miles. */
  distanceNm: number;
  /** Bearing from the airport to the aircraft — which side of the field to look. */
  bearingFromAirportDeg: number;
  /** 16-point compass label for `bearingFromAirportDeg`. */
  fromDirection: string;
  /** Rough time to touchdown. Null when ground speed is missing or implausible. */
  minutesOut: number | null;

  categories: CategoryId[];
  /** Scheduled origin and destination. Null until the lookup lands, or if there is none. */
  route: FlightRoute | null;
  /** Who operates it, from the airframe record or the route. Null until known. */
  operator: string | null;
  /** ICAO airline code for `operator`, when there is one. */
  operatorIcao: string | null;
  /** Seconds since the position fix, straight from the feed. */
  seenPosSec: number;
}

/** One scheduled arrival on the Upcoming board. */
export interface UpcomingFlight {
  /** Commercial flight number, e.g. "AC 855". */
  number: string | null;
  callsign: string | null;
  airline: string | null;
  /** The operator's own word for it: "Expected", "Delayed", "Arrived". */
  status: string | null;
  /** ICAO and IATA codes for `airline`, e.g. "ACA" and "AC". */
  airlineIcao: string | null;
  airlineIata: string | null;
  isCargo: boolean;

  /** ICAO designator, normalised from the vendor's free-text model. */
  type: string | null;
  /** The vendor's free text, kept so an unmapped model is still legible. */
  model: string | null;
  typeName: string | null;
  registration: string | null;
  /** ICAO 24-bit address — the same key the live board uses, when supplied. */
  hex: string | null;

  origin: { icao: string | null; iata: string | null; name: string | null } | null;

  /** Best known arrival time, ISO 8601 UTC. */
  arrivalTime: string;
  /** True when that time is the operator's revision rather than the schedule. */
  arrivalIsRevised: boolean;
  terminal: string | null;
  gate: string | null;

  categories: CategoryId[];
}

export interface UpcomingSnapshot {
  airport: { icao: string; iata: string; name: string; timeZone: string };
  /** When the schedule was last fetched, epoch ms. 0 before the first fetch. */
  updatedAt: number;
  ageSeconds: number;
  /** True when the data is older than a refresh interval and could not be renewed. */
  stale: boolean;
  /**
   * True when nothing has been fetched yet but a fetch is under way. Distinct from
   * unavailable: the tab should say "loading", not "out of date".
   */
  loading: boolean;
  /**
   * True when there is nothing usable to show: unconfigured, never fetched, or
   * holding a cache so old its window no longer reaches the present. An empty
   * flights list with this false means genuinely nothing big is due.
   */
  unavailable: boolean;
  /** Why it is unavailable, or the last failure while serving cache. */
  error: string | null;
  /** How far ahead the window reaches, hours. */
  windowHours: number;
  /** Everything the window held, before filtering to big aircraft. */
  totalScheduled: number;
  flights: UpcomingFlight[];
  /** Models we could not map to a designator. Surfaced rather than hidden. */
  unrecognisedModels: string[];
  /** Remaining monthly API units, when the upstream tells us. */
  unitsRemaining: number | null;
}

/**
 * Which way the airport is landing, read off the aircraft themselves.
 *
 * Null whenever the sky cannot say — too little traffic, or nothing lined up with
 * a runway. Null must render as silence: sending a spotter to the wrong side of
 * an airport is worse than telling them nothing.
 */
export interface LandingFlow {
  /** True heading aircraft fly when landing this way. */
  headingDeg: number;
  /** What a local calls it: "05/06", "23/24", "27". */
  label: string;
  /** Every runway end pointing this way; left and right are one direction. */
  idents: string[];
  /** Compass point of the landing direction, e.g. "NE". */
  compass: string;
  /** The same in words, for a sentence: "northeast". */
  words: string;
  /** The side approaches come from, which is where to stand: "southwest". */
  approachFrom: string;
  /** How many aircraft agreed. */
  sample: number;
  /** "firm" when an aircraft committed to a runway settled it, with no tie. */
  confidence: "firm" | "likely";
}

export interface SnapshotSource {
  /** Aggregator host that served the current data. */
  host: string;
  attribution: { label: string; url: string; note: string };
}

/** The payload behind both the REST endpoint and every SSE message. */
export interface InboundSnapshot {
  airport: {
    icao: string;
    iata: string;
    name: string;
    city: string;
    lat: number;
    lon: number;
    timeZone: string;
  };
  /** When the upstream data was fetched, epoch ms. */
  updatedAt: number;
  /** Age of that data at serialisation time, seconds. */
  ageSeconds: number;
  /** True when we are serving cache we could not refresh. */
  stale: boolean;
  /** Last upstream failure, if we are currently degraded. */
  error: string | null;
  source: SnapshotSource;
  /** Aircraft the feed returned inside the search radius, before inbound rules. */
  totalTracked: number;
  aircraft: InboundAircraft[];
  /** How many inbound aircraft fall in each category. Drives the chip badges. */
  counts: Record<string, number>;
  /** Which way the airport is landing, or null when the sky cannot say. */
  landing: LandingFlow | null;
}

/** The icon the weather card draws. Chosen here, so the frontend ships no METAR knowledge. */
export type WeatherIcon =
  | "clear"
  | "mostly-clear"
  | "partly-cloudy"
  | "mostly-cloudy"
  | "overcast"
  | "showers"
  | "rain"
  | "snow"
  | "thunder"
  | "fog"
  | "haze";

/** Cloud cover in METAR's own words. OVX is a sky obscured, usually by fog. */
export type CloudCover = "FEW" | "SCT" | "BKN" | "OVC" | "OVX";

/** One airfield observation, already translated out of METAR. */
export interface WeatherObservation {
  /** When the station observed it, ISO 8601 UTC. Age is counted from here, not from our fetch. */
  observedAt: string;
  temperatureC: number | null;
  dewpointC: number | null;
  /** Derived from temperature and dewpoint; METAR does not report it. */
  humidityPct: number | null;
  /** Null when the station reported no wind at all. */
  wind: {
    /** Degrees true the wind blows from. Null when variable or calm. */
    directionDeg: number | null;
    /** 16-point label for directionDeg, e.g. "NW". */
    fromCompass: string | null;
    speedKt: number;
    /** Only when it gusts above the mean wind. */
    gustKt: number | null;
    variable: boolean;
    calm: boolean;
  } | null;
  visibilityKm: number | null;
  /** The station reported a floor ("10+"), so the value means "at least this". */
  visibilityOrMore: boolean;
  /**
   * The ceiling - lowest broken or overcast layer - or, with no ceiling, the lowest
   * layer of any kind. Null for a clear or unreported sky.
   */
  cloudBase: { cover: CloudCover; baseFt: number } | null;
  /** Plain words: "Partly cloudy", "Light rain showers", "Showers nearby". */
  condition: string;
  icon: WeatherIcon;
  /** Whether the sun is up at the airport now, for a sun or a moon. */
  isDay: boolean;
  /** The METAR as issued, for anyone who reads the code. */
  raw: string;
}

/** The payload behind /api/airport/:icao/weather. */
export interface WeatherSnapshot {
  airport: { icao: string; iata: string };
  /** Null before the first report, and once the latest is too old to show as current. */
  observation: WeatherObservation | null;
  /** Age of the observation itself, seconds. Null when there is none. */
  ageSeconds: number | null;
  /** An hourly report has been missed, or the last refresh failed. Shown, but marked. */
  stale: boolean;
  /** Nothing fetched yet, but a fetch is due. The card says "loading", not "unavailable". */
  loading: boolean;
  /** Nothing usable to show. */
  unavailable: boolean;
  error: string | null;
}

export interface CategoryDto {
  id: CategoryId;
  group: GroupId;
  label: string;
  blurb: string;
  fallback: boolean;
}

export interface ConfigDto {
  /** Whether the Upcoming board is configured. False hides the tab entirely. */
  upcomingEnabled: boolean;
  /** Airframe categories the Upcoming board is limited to. */
  upcomingCategories: CategoryId[];
  /** Whether the weather card has a source. False hides the strip and the card. */
  weatherEnabled: boolean;
  /** Every upstream we take data from, for the credits line in the footer. */
  sources: Array<{ label: string; url: string }>;
  airports: Array<{
    icao: string;
    iata: string;
    name: string;
    city: string;
    timeZone: string;
    /** The airport's own site, for the airport card. Null when unknown. */
    website: string | null;
    /** Hero artwork path, or null while the frontend draws its own placeholder. */
    heroImage: string | null;
    tracked: boolean;
    /** Whether this airport has an Upcoming board. Not every tracked one does. */
    hasSchedule: boolean;
  }>;
  defaultAirport: string;
  groups: Array<{ id: GroupId; label: string }>;
  categories: CategoryDto[];
  rules: {
    maxAltitudeFt: number;
    maxDistanceNm: number;
    descentRateFpm: number;
    lowAltitudeFt: number;
    maxTrackOffsetDeg: number;
    maxPositionAgeSec: number;
  };
  attribution: SnapshotSource["attribution"];
  pollIntervalMs: number;
}
