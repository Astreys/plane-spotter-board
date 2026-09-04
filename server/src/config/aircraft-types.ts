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

const FREIGHTER_TYPES = ["B77F", "B74S", "B74R", "MD11", "BLCF", "A124", "C5M", "B77L"] as const;

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
 * Human-readable name for a type code, used in the row subtitle. Deliberately
 * partial — anything missing falls back to the raw code, which is what a spotter
 * reads anyway.
 */
export const TYPE_NAMES: Readonly<Record<string, string>> = {
  A388: "Airbus A380-800",
  A342: "Airbus A340-200",
  A343: "Airbus A340-300",
  A345: "Airbus A340-500",
  A346: "Airbus A340-600",
  A332: "Airbus A330-200",
  A333: "Airbus A330-300",
  A337: "Airbus A330-700 Beluga XL",
  A338: "Airbus A330-800neo",
  A339: "Airbus A330-900neo",
  A359: "Airbus A350-900",
  A35K: "Airbus A350-1000",
  A306: "Airbus A300-600",
  A30B: "Airbus A300",
  A310: "Airbus A310",
  A124: "Antonov An-124",
  B741: "Boeing 747-100",
  B742: "Boeing 747-200",
  B743: "Boeing 747-300",
  B744: "Boeing 747-400",
  B748: "Boeing 747-8",
  B74R: "Boeing 747SR",
  B74S: "Boeing 747SP",
  B74D: "Boeing 747-400D",
  BLCF: "Boeing 747 Dreamlifter",
  B762: "Boeing 767-200",
  B763: "Boeing 767-300",
  B764: "Boeing 767-400",
  B772: "Boeing 777-200",
  B773: "Boeing 777-300",
  B77L: "Boeing 777-200LR",
  B77W: "Boeing 777-300ER",
  B77F: "Boeing 777F",
  B788: "Boeing 787-8",
  B789: "Boeing 787-9",
  B78X: "Boeing 787-10",
  MD11: "McDonnell Douglas MD-11",
  IL96: "Ilyushin Il-96",
  C5M: "Lockheed C-5M Super Galaxy",
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
