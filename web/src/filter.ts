import type { CategoryDto, CategoryId, InboundAircraft } from "./api";

/**
 * Same rule as the server: OR within a group, AND across groups. Kept in step
 * with server/src/domain/filters.ts — that one is the reference, this one exists
 * so tapping a chip does not need a round trip.
 */
export function matches(
  aircraft: InboundAircraft,
  selected: CategoryId[],
  categories: CategoryDto[],
): boolean {
  if (selected.length === 0) return true;

  const groupOf = new Map(categories.map((category) => [category.id, category.group]));
  const byGroup = new Map<string, CategoryId[]>();

  for (const id of selected) {
    const group = groupOf.get(id);
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
  categories: CategoryDto[],
): InboundAircraft[] {
  if (selected.length === 0) return aircraft;
  return aircraft.filter((ac) => matches(ac, selected, categories));
}

/**
 * "nothing widebody inbound in the next 30 min" beats a blank screen, so build the
 * sentence out of whatever the spotter actually selected.
 */
export function emptyStateText(selected: CategoryId[], categories: CategoryDto[]): string {
  if (selected.length === 0) return "Nothing inbound right now";

  const blurbs = selected
    .map((id) => categories.find((category) => category.id === id)?.blurb)
    .filter((blurb): blurb is string => Boolean(blurb));

  if (blurbs.length === 0) return "Nothing inbound right now";
  const list =
    blurbs.length === 1
      ? blurbs[0]
      : `${blurbs.slice(0, -1).join(", ")} or ${blurbs[blurbs.length - 1]}`;

  return `Nothing ${list} inbound right now`;
}
