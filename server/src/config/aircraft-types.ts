/**
 * The aircraft taxonomy. This is the file you edit when a new type shows up or a
 * classification is wrong. Nothing else should contain a hardcoded ICAO type code.
 *
 * Type codes are ICAO aircraft type designators as they appear in the ADS-B `t`
 * field: A388, B77W, B748. Always uppercase here; lookups normalise the input.
 *
 * Categories live in groups. The UI renders one chip row per group, and the
 * filter is OR within a group, AND across groups — so "double deck + quad" means
 * either, while "widebody + freighter" means both.
 */

export type CategoryId =
  | "DOUBLE_DECK"
  | "QUAD"
  | "WIDEBODY"
  | "OTHER"
  | "FREIGHTER"
  | "RARE";

export type GroupId = "airframe" | "role" | "interest";

export interface CategoryGroup {
  id: GroupId;
  label: string;
}

export interface CategoryDef {
  id: CategoryId;
  group: GroupId;
  label: string;
  /** Short line for the empty state: "nothing {blurb} inbound in the next 30 min". */
  blurb: string;
  /** ICAO type codes that match this category. */
  types: readonly string[];
  /** Callsign prefixes that match regardless of type (cargo operators). */
  callsignPrefixes?: readonly string[];
  /**
   * Catch-all bucket: matches anything no other category in its group matched.
   * Computed, so `types` is empty.
   */
  fallback?: boolean;
}

export const CATEGORY_GROUPS: readonly CategoryGroup[] = [
  { id: "airframe", label: "Airframe" },
  { id: "role", label: "Role" },
  { id: "interest", label: "Interest" },
];

const DOUBLE_DECK_TYPES = [
  "A388",
  "B741",
  "B742",
  "B743",
  "B744",
  "B748",
  "B74R",
  "B74S",
  "B74D",
  "BLCF",
] as const;

const QUAD_ONLY_TYPES = ["A342", "A343", "A345", "A346", "IL96", "A124", "C5M"] as const;

/** Everything with four engines, including the double deckers. */
const QUAD_TYPES = [...DOUBLE_DECK_TYPES, ...QUAD_ONLY_TYPES] as const;

/** Twin-engine widebodies. QUAD is folded in below. */
const TWIN_WIDEBODY_TYPES = [
  "A332",
  "A333",
  "A338",
  "A339",
  "A337",
  "A359",
  "A35K",
  "B762",
  "B763",
  "B764",
  "B772",
  "B773",
  "B77L",
  "B77W",
  "B77F",
  "B788",
  "B789",
  "B78X",
  "A306",
  "A30B",
  "A310",
  "MD11",
] as const;

const WIDEBODY_TYPES = [...QUAD_TYPES, ...TWIN_WIDEBODY_TYPES] as const;

/**
 * Airframes that are freighters by type. B77L is deliberately absent: it is the
 * passenger 777-200LR and the freighter is B77F. Listing it here labelled every
 * Air Canada 777-200LR as cargo.
 */
const FREIGHTER_TYPES = ["B77F", "B74S", "B74R", "MD11", "BLCF", "A124", "C5M"] as const;

/**
 * Cargo operators, matched on the leading letters of the callsign. Kept short and
 * conservative — a false positive here mislabels a passenger flight.
 */
const FREIGHTER_CALLSIGN_PREFIXES = [
  "FDX", // FedEx
  "UPS", // UPS
  "GTI", // Atlas Air
  "GEC", // Lufthansa Cargo
  "BOX", // AeroLogic
  "CLX", // Cargolux
  "CKS", // Kalitta Air
  "CJT", // Cargojet
  "ABX", // ABX Air
  "ATN", // Air Transport International
  "NCA", // Nippon Cargo
  "SQC", // Singapore Airlines Cargo
  "MPH", // Martinair
  "ABW", // AirBridgeCargo
  "AHK", // Air Hong Kong
  "GSS", // Atlas Air (Global Supply Systems)
  "RCF", // Aerotranscargo
  "MSX", // MASkargo
  "CAO", // Air China Cargo
  "CKK", // China Cargo
] as const;

/** Hand-maintained. Add whatever you would actually drive to the fence for. */
const RARE_TYPES = [
  "A388",
  "B748",
  "B744",
  "B74R",
  "B74S",
  "A124",
  "MD11",
  "IL96",
  "A345",
  "A346",
  "BLCF",
  "C5M",
] as const;

export const CATEGORIES: readonly CategoryDef[] = [
  {
    id: "DOUBLE_DECK",
    group: "airframe",
    label: "Double deck",
    blurb: "double deck",
    types: DOUBLE_DECK_TYPES,
  },
  {
    id: "QUAD",
    group: "airframe",
    label: "Quad",
    blurb: "four-engined",
    types: QUAD_TYPES,
  },
  {
    id: "WIDEBODY",
    group: "airframe",
    label: "Widebody",
    blurb: "widebody",
    types: WIDEBODY_TYPES,
  },
  {
    id: "OTHER",
    group: "airframe",
    label: "Other",
    blurb: "unclassified",
    types: [],
    fallback: true,
  },
  {
    id: "FREIGHTER",
    group: "role",
    label: "Freighter",
    blurb: "freight",
    types: FREIGHTER_TYPES,
    callsignPrefixes: FREIGHTER_CALLSIGN_PREFIXES,
  },
  {
    id: "RARE",
    group: "interest",
    label: "Rare",
    blurb: "rare",
    types: RARE_TYPES,
  },
];

const BY_ID = new Map<CategoryId, CategoryDef>(CATEGORIES.map((c) => [c.id, c]));

/** Type code -> the categories it belongs to. Built once at startup. */
const BY_TYPE = (() => {
  const index = new Map<string, CategoryId[]>();
  for (const category of CATEGORIES) {
    for (const type of category.types) {
      const list = index.get(type) ?? [];
      list.push(category.id);
      index.set(type, list);
    }
  }
  return index;
})();

export function getCategory(id: CategoryId): CategoryDef | undefined {
  return BY_ID.get(id);
}

export function isCategoryId(value: string): value is CategoryId {
  return BY_ID.has(value as CategoryId);
}

/**
 * Human-readable name for an ICAO type code.
 *
 * Names are written the way a spotter says them out loud, not the way ICAO doc
 * 8643 writes them: "Boeing 737 MAX 8", not "B737 MAX 8 (winglets)". Where a code
 * distinguishes a variant nobody says aloud, the common name wins.
 *
 * Still deliberately partial — the feed carries a long tail of codes, and an
 * unmapped one falls back to the raw code, which is legible on its own. Add
 * entries here as you meet them; nothing else needs to change.
 */
export const TYPE_NAMES: Readonly<Record<string, string>> = {
  // Airbus
  A124: "Antonov An-124",
  A19N: "Airbus A319neo",
  A20N: "Airbus A320neo",
  A21N: "Airbus A321neo",
  A306: "Airbus A300-600",
  A30B: "Airbus A300",
  A310: "Airbus A310",
  A318: "Airbus A318",
  A319: "Airbus A319",
  A320: "Airbus A320",
  A321: "Airbus A321",
  A332: "Airbus A330-200",
  A333: "Airbus A330-300",
  A337: "Airbus A330-700 Beluga XL",
  A338: "Airbus A330-800neo",
  A339: "Airbus A330-900neo",
  A342: "Airbus A340-200",
  A343: "Airbus A340-300",
  A345: "Airbus A340-500",
  A346: "Airbus A340-600",
  A359: "Airbus A350-900",
  A35K: "Airbus A350-1000",
  A388: "Airbus A380-800",
  BCS1: "Airbus A220-100",
  BCS3: "Airbus A220-300",

  // Boeing
  B37M: "Boeing 737 MAX 7",
  B38M: "Boeing 737 MAX 8",
  B39M: "Boeing 737 MAX 9",
  B3XM: "Boeing 737 MAX 10",
  B712: "Boeing 717-200",
  B722: "Boeing 727-200",
  B732: "Boeing 737-200",
  B733: "Boeing 737-300",
  B734: "Boeing 737-400",
  B735: "Boeing 737-500",
  B736: "Boeing 737-600",
  B737: "Boeing 737-700",
  B738: "Boeing 737-800",
  B739: "Boeing 737-900",
  B741: "Boeing 747-100",
  B742: "Boeing 747-200",
  B743: "Boeing 747-300",
  B744: "Boeing 747-400",
  B748: "Boeing 747-8",
  B74D: "Boeing 747-400D",
  B74R: "Boeing 747SR",
  B74S: "Boeing 747SP",
  B752: "Boeing 757-200",
  B753: "Boeing 757-300",
  B762: "Boeing 767-200",
  B763: "Boeing 767-300",
  B764: "Boeing 767-400",
  B772: "Boeing 777-200",
  B773: "Boeing 777-300",
  B77F: "Boeing 777F",
  B77L: "Boeing 777-200LR",
  B77W: "Boeing 777-300ER",
  B788: "Boeing 787-8",
  B789: "Boeing 787-9",
  B78X: "Boeing 787-10",
  BLCF: "Boeing 747 Dreamlifter",

  // Embraer
  E110: "Embraer EMB-110 Bandeirante",
  E120: "Embraer EMB-120 Brasilia",
  E135: "Embraer ERJ-135",
  E145: "Embraer ERJ-145",
  E170: "Embraer ERJ-170",
  E190: "Embraer ERJ-190",
  E195: "Embraer ERJ-195",
  E290: "Embraer E190-E2",
  E295: "Embraer E195-E2",
  E50P: "Embraer Phenom 100",
  E545: "Embraer Legacy 450",
  E550: "Embraer Legacy 500",
  E55P: "Embraer Phenom 300",
  E75L: "Embraer ERJ-175LR",
  E75S: "Embraer ERJ-175SU",

  // Bombardier and De Havilland Canada
  CRJ1: "Bombardier CRJ100",
  CRJ2: "Bombardier CRJ200",
  CRJ7: "Bombardier CRJ700",
  CRJ9: "Bombardier CRJ900",
  CRJX: "Bombardier CRJ1000",
  DH8A: "De Havilland Dash 8-100",
  DH8B: "De Havilland Dash 8-200",
  DH8C: "De Havilland Dash 8-300",
  DH8D: "De Havilland Dash 8-400",
  DHC2: "De Havilland Beaver",
  DHC6: "De Havilland Twin Otter",
  CL30: "Bombardier Challenger 300",
  CL35: "Bombardier Challenger 350",
  CL60: "Bombardier Challenger 600",
  GL5T: "Bombardier Global 5000",
  GL7T: "Bombardier Global 7500",
  GLEX: "Bombardier Global Express",
  LJ35: "Learjet 35",
  LJ45: "Learjet 45",
  LJ60: "Learjet 60",
  LJ75: "Learjet 75",

  // Other regional and turboprop
  AT43: "ATR 42-300",
  AT45: "ATR 42-500",
  AT46: "ATR 42-600",
  AT72: "ATR 72-200",
  AT75: "ATR 72-500",
  AT76: "ATR 72-600",
  B190: "Beechcraft 1900",
  D228: "Dornier 228",
  D328: "Dornier 328",
  F100: "Fokker 100",
  F70: "Fokker 70",
  JS41: "BAe Jetstream 41",
  SB20: "Saab 2000",
  SF34: "Saab 340",
  SW4: "Fairchild Metroliner",

  // Business jets
  C25A: "Cessna Citation CJ2",
  C25B: "Cessna Citation CJ3",
  C25C: "Cessna Citation CJ4",
  C510: "Cessna Citation Mustang",
  C525: "Cessna CitationJet",
  C550: "Cessna Citation II",
  C560: "Cessna Citation V",
  C56X: "Cessna Citation Excel",
  C650: "Cessna Citation III",
  C680: "Cessna Citation Sovereign",
  C68A: "Cessna Citation Latitude",
  C700: "Cessna Citation Longitude",
  C750: "Cessna Citation X",
  F2TH: "Dassault Falcon 2000",
  F900: "Dassault Falcon 900",
  FA50: "Dassault Falcon 50",
  FA7X: "Dassault Falcon 7X",
  FA8X: "Dassault Falcon 8X",
  BE40: "Beechcraft Beechjet 400",
  EA50: "Eclipse 500",
  G280: "Gulfstream G280",
  GLF4: "Gulfstream IV",
  GLF5: "Gulfstream V",
  GLF6: "Gulfstream G650",
  H25B: "Hawker 800",
  PC12: "Pilatus PC-12",
  SF50: "Cirrus Vision Jet",
  PC24: "Pilatus PC-24",
  TBM7: "Daher TBM 700",
  TBM8: "Daher TBM 850",
  TBM9: "Daher TBM 900",

  // General aviation
  B350: "Beechcraft King Air 350",
  BE10: "Beechcraft King Air 100",
  BE20: "Beechcraft King Air 200",
  BE33: "Beechcraft Debonair",
  BE35: "Beechcraft Bonanza",
  BE36: "Beechcraft Bonanza 36",
  BE58: "Beechcraft Baron",
  BE76: "Beechcraft Duchess",
  BE9L: "Beechcraft King Air 90",
  AC11: "Rockwell Commander 112",
  C150: "Cessna 150",
  C152: "Cessna 152",
  C172: "Cessna 172 Skyhawk",
  C177: "Cessna 177 Cardinal",
  C182: "Cessna 182 Skylane",
  C185: "Cessna 185 Skywagon",
  C206: "Cessna 206 Stationair",
  C208: "Cessna 208 Caravan",
  C210: "Cessna 210 Centurion",
  C310: "Cessna 310",
  C441: "Cessna 441 Conquest II",
  C72R: "Cessna 172RG Cutlass",
  C82R: "Cessna 182RG Skylane",
  T210: "Cessna T210 Turbo Centurion",
  DA40: "Diamond DA40 Star",
  DA42: "Diamond DA42 Twin Star",
  DA62: "Diamond DA62",
  M20P: "Mooney M20",
  M700: "Piper M700 Fury",
  P28A: "Piper PA-28 Cherokee",
  P28R: "Piper PA-28R Arrow",
  PA12: "Piper PA-12 Super Cruiser",
  PA24: "Piper PA-24 Comanche",
  PA27: "Piper PA-27 Aztec",
  PA31: "Piper PA-31 Navajo",
  PA32: "Piper PA-32 Cherokee Six",
  PA34: "Piper PA-34 Seneca",
  PA44: "Piper PA-44 Seminole",
  PA46: "Piper PA-46 Malibu",
  RV8: "Van's RV-8",
  S22T: "Cirrus SR22T",
  SR20: "Cirrus SR20",
  SR22: "Cirrus SR22",

  // Helicopters
  A139: "Leonardo AW139",
  AS50: "Airbus AS350 Ecureuil",
  B06: "Bell 206 JetRanger",
  B407: "Bell 407",
  B412: "Bell 412",
  EC30: "Airbus H130",
  H160: "Airbus H160",
  H47: "Boeing CH-47 Chinook",
  EC35: "Airbus H135",
  EC45: "Airbus H145",
  R44: "Robinson R44",
  R66: "Robinson R66",
  S76: "Sikorsky S-76",

  // Freighters, military and the rest
  A225: "Antonov An-225 Mriya",
  C130: "Lockheed C-130 Hercules",
  C17: "Boeing C-17 Globemaster III",
  C30J: "Lockheed C-130J Super Hercules",
  C5M: "Lockheed C-5M Super Galaxy",
  E3TF: "Boeing E-3 Sentry",
  H60: "Sikorsky UH-60 Black Hawk",
  IL76: "Ilyushin Il-76",
  IL96: "Ilyushin Il-96",
  K35R: "Boeing KC-135 Stratotanker",
  MD11: "McDonnell Douglas MD-11",
  MD82: "McDonnell Douglas MD-82",
  MD83: "McDonnell Douglas MD-83",
  MD88: "McDonnell Douglas MD-88",
  MD90: "McDonnell Douglas MD-90",
  P8: "Boeing P-8 Poseidon",

  // Not aircraft types, but the feed emits them and a raw code here reads as a
  // mystery rather than as what it is.
  GLID: "Glider",
  SERV: "Ground vehicle",
  ULAC: "Ultralight",
};

/**
 * Categories an aircraft belongs to. Unknown or missing type codes land in the
 * fallback bucket for their group rather than disappearing.
 */
export function categoriesFor(input: {
  type?: string | null;
  callsign?: string | null;
}): CategoryId[] {
  const type = input.type?.trim().toUpperCase() ?? "";
  const callsign = input.callsign?.trim().toUpperCase() ?? "";

  const matched = new Set<CategoryId>(type ? (BY_TYPE.get(type) ?? []) : []);

  if (callsign) {
    for (const category of CATEGORIES) {
      if (matched.has(category.id)) continue;
      if (category.callsignPrefixes?.some((prefix) => callsign.startsWith(prefix))) {
        matched.add(category.id);
      }
    }
  }

  for (const category of CATEGORIES) {
    if (!category.fallback) continue;
    const groupHasMatch = CATEGORIES.some(
      (other) => other.group === category.group && !other.fallback && matched.has(other.id),
    );
    if (!groupHasMatch) matched.add(category.id);
  }

  // Stable order: follow the declaration order in CATEGORIES.
  return CATEGORIES.filter((c) => matched.has(c.id)).map((c) => c.id);
}
