import { onScopeDispose, ref, type Ref } from "vue";

/**
 * Whether a media query matches, kept current as the window changes.
 *
 * The board filter needs this rather than CSS alone. Hiding the box with a media
 * query would leave a query typed on a wide window still filtering the list after
 * the window narrows - rows would vanish with nothing on screen to explain why.
 * Knowing the width in script lets the filter switch off with the box.
 *
 * Without `matchMedia` (a test environment, say) it reports `fallback`.
 */
export function useMediaQuery(query: string, fallback = true): Ref<boolean> {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return ref(fallback);
  }

  const list = window.matchMedia(query);
  const matches = ref(list.matches);
  const update = (event: MediaQueryListEvent): void => {
    matches.value = event.matches;
  };

  list.addEventListener("change", update);
  onScopeDispose(() => list.removeEventListener("change", update));

  return matches;
}
