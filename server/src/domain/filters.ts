/**
 * Filter semantics: OR within a group, AND across groups.
 *
 * Selecting "double deck" and "quad" (both airframe) shows either. Adding
 * "freighter" (role) then narrows that to the ones which are also freight.
 */

import { CATEGORIES, isCategoryId, type CategoryId } from "../config/aircraft-types.js";
import type { InboundAircraft } from "../types.js";

const GROUP_OF = new Map<CategoryId, string>(CATEGORIES.map((c) => [c.id, c.group]));

/** Drop anything that is not a known category id, so a bad query string is inert. */
export function parseCategories(input: string | string[] | undefined): CategoryId[] {
  if (input === undefined) return [];
  const parts = (Array.isArray(input) ? input : input.split(","))
    .flatMap((part) => part.split(","))
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);

  const seen = new Set<CategoryId>();
  for (const part of parts) {
    if (isCategoryId(part)) seen.add(part);
  }
  return [...seen];
}

export function matches(aircraft: InboundAircraft, selected: CategoryId[]): boolean {
  if (selected.length === 0) return true;

  const byGroup = new Map<string, CategoryId[]>();
  for (const id of selected) {
    const group = GROUP_OF.get(id);
    if (!group) continue;
    const list = byGroup.get(group) ?? [];
    list.push(id);
    byGroup.set(group, list);
  }

  for (const groupSelection of byGroup.values()) {
    if (!groupSelection.some((id) => aircraft.categories.includes(id))) return false;
  }
  return true;
}

export function applyFilters(
  aircraft: InboundAircraft[],
  selected: CategoryId[],
): InboundAircraft[] {
  if (selected.length === 0) return aircraft;
  return aircraft.filter((ac) => matches(ac, selected));
}

/**
 * Category -> count over the unfiltered list. The chips show these so you can see
 * there is a widebody coming before you tap the chip.
 */
export function countByCategory(aircraft: InboundAircraft[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const category of CATEGORIES) counts[category.id] = 0;
  for (const ac of aircraft) {
    for (const id of ac.categories) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}
