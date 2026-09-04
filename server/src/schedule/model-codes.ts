/**
 * AeroDataBox reports aircraft as free text — "Boeing 777-300ER", "Airbus A330",
 * and occasionally "Canadair reg jet 700" — not as ICAO type designators. The
 * taxonomy in config/aircraft-types.ts is keyed by designator, so schedule
 * entries are normalised onto a designator here and then classified by exactly
 * the same rules as live traffic. Nothing downstream needs to know the schedule
 * spoke a different language.
 *
 * Order matters: the first pattern that matches wins, so specific variants must
 * come before the family they belong to ("Boeing 777-300ER" before "Boeing 777").
 *
 * Where a family is given with no variant we map to the commonest member rather
 * than inventing precision — "Boeing 787" becomes B789. The airframe category is
 * right either way, which is what the board filters on.
 */

export interface ModelPattern {
  readonly pattern: RegExp;
  readonly type: string;
}

export const MODEL_PATTERNS: readonly ModelPattern[] = [
  // Airbus widebodies
  { pattern: /^airbus a380/, type: "A388" },
  { pattern: /^airbus a350-1000/, type: "A35K" },
  { pattern: /^airbus a350-900/, type: "A359" },
  { pattern: /^airbus a350/, type: "A359" },
  { pattern: /^airbus a340-600/, type: "A346" },
  { pattern: /^airbus a340-500/, type: "A345" },
  { pattern: /^airbus a340-300/, type: "A343" },
  { pattern: /^airbus a340-200/, type: "A342" },
  { pattern: /^airbus a340/, type: "A343" },
  { pattern: /^airbus a330-900/, type: "A339" },
  { pattern: /^airbus a330-800/, type: "A338" },
  { pattern: /^airbus a330-300/, type: "A333" },
  { pattern: /^airbus a330-200/, type: "A332" },
  { pattern: /^airbus a330/, type: "A333" },
  { pattern: /^airbus a310/, type: "A310" },
  { pattern: /^airbus a300/, type: "A306" },

  // Boeing widebodies
  { pattern: /^boeing 747-8/, type: "B748" },
  { pattern: /^boeing 747-400/, type: "B744" },
  { pattern: /^boeing 747sp/, type: "B74S" },
  { pattern: /^boeing 747/, type: "B744" },
  { pattern: /^boeing 787-10/, type: "B78X" },
  { pattern: /^boeing 787-9/, type: "B789" },
  { pattern: /^boeing 787-8/, type: "B788" },
  { pattern: /^boeing 787/, type: "B789" },
  { pattern: /^boeing 777-300er/, type: "B77W" },
  { pattern: /^boeing 777-300/, type: "B773" },
  { pattern: /^boeing 777-200lr/, type: "B77L" },
  { pattern: /^boeing 777-200f/, type: "B77F" },
  { pattern: /^boeing 777-200/, type: "B772" },
  { pattern: /^boeing 777f/, type: "B77F" },
  { pattern: /^boeing 777/, type: "B772" },
  { pattern: /^boeing 767-400/, type: "B764" },
  { pattern: /^boeing 767-300/, type: "B763" },
  { pattern: /^boeing 767-200/, type: "B762" },
  { pattern: /^boeing 767/, type: "B763" },

  // The rest of the big metal
  { pattern: /^mcdonnell douglas md-?11/, type: "MD11" },
  { pattern: /^antonov an-?124/, type: "A124" },
  { pattern: /^antonov an-?225/, type: "A225" },
  { pattern: /^ilyushin il-?96/, type: "IL96" },
  { pattern: /^ilyushin il-?76/, type: "IL76" },
  { pattern: /^lockheed c-?5/, type: "C5M" },

  // Narrowbodies and regionals. Not shown on the Upcoming board, but mapping them
  // keeps "unrecognised" meaning "genuinely unknown" rather than "small".
  { pattern: /^airbus a220-300/, type: "BCS3" },
  { pattern: /^airbus a220-100/, type: "BCS1" },
  { pattern: /^airbus a321.*neo/, type: "A21N" },
  { pattern: /^airbus a320.*neo/, type: "A20N" },
  { pattern: /^airbus a319.*neo/, type: "A19N" },
  { pattern: /^airbus a321/, type: "A321" },
  { pattern: /^airbus a320/, type: "A320" },
  { pattern: /^airbus a319/, type: "A319" },
  { pattern: /^airbus a318/, type: "A318" },
  { pattern: /^boeing 737 max 10/, type: "B3XM" },
  { pattern: /^boeing 737 max 9/, type: "B39M" },
  { pattern: /^boeing 737 max 8/, type: "B38M" },
  { pattern: /^boeing 737 max 7/, type: "B37M" },
  { pattern: /^boeing 737-900/, type: "B739" },
  { pattern: /^boeing 737-800/, type: "B738" },
  { pattern: /^boeing 737-700/, type: "B737" },
  { pattern: /^boeing 737-600/, type: "B736" },
  { pattern: /^boeing 737/, type: "B738" },
  { pattern: /^boeing 757-300/, type: "B753" },
  { pattern: /^boeing 757/, type: "B752" },
  { pattern: /^boeing 717/, type: "B712" },
  { pattern: /^embraer 195-e2/, type: "E295" },
  { pattern: /^embraer 190-e2/, type: "E290" },
  { pattern: /^embraer 195/, type: "E195" },
  { pattern: /^embraer 190/, type: "E190" },
  { pattern: /^embraer 175/, type: "E75L" },
  { pattern: /^embraer 170/, type: "E170" },
  { pattern: /^embraer rj145/, type: "E145" },
  { pattern: /^embraer rj135/, type: "E135" },
  // "Canadair reg jet 700" is their spelling, not a typo on our side.
  { pattern: /^(bombardier|canadair).*(crj ?1000|crj1000)/, type: "CRJX" },
  { pattern: /^(bombardier|canadair).*(crj ?900|reg ?jet 900)/, type: "CRJ9" },
  { pattern: /^(bombardier|canadair).*(crj ?700|reg ?jet 700)/, type: "CRJ7" },
  { pattern: /^(bombardier|canadair).*(crj ?200|reg ?jet 200)/, type: "CRJ2" },
  { pattern: /^bombardier dash 8 q400/, type: "DH8D" },
  { pattern: /^(bombardier )?dash 8/, type: "DH8D" },
  { pattern: /^atr 72/, type: "AT76" },
  { pattern: /^atr 42/, type: "AT46" },
];

/**
 * Free-text model -> ICAO designator, or null when we do not recognise it.
 *
 * A value that already looks like a designator ("BCS3", "E295") is passed
 * through: AeroDataBox mixes the two, and rejecting those would lose real
 * aircraft.
 */
export function toTypeCode(model: string | null | undefined): string | null {
  if (!model) return null;
  const trimmed = model.trim();
  if (trimmed === "") return null;

  const normalised = trimmed.toLowerCase();
  for (const { pattern, type } of MODEL_PATTERNS) {
    if (pattern.test(normalised)) return type;
  }

  // Already a designator? Three or four characters, no spaces, has a digit.
  const upper = trimmed.toUpperCase();
  if (/^[A-Z0-9]{3,4}$/.test(upper) && /\d/.test(upper)) return upper;

  return null;
}
