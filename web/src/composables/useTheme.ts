import { computed, onScopeDispose, ref, watch, type ComputedRef, type Ref } from "vue";
import {
  THEME_COLORS,
  nextTheme,
  readStoredTheme,
  resolveTheme,
  storeTheme,
  themeLabel,
  type ResolvedTheme,
  type ThemeChoice,
} from "../theme";

/** Our override has to beat the two in index.html, which carry media queries. */
const THEME_COLOR_ID = "psb-theme-color";

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    // The stylesheet is dark by default, so match it rather than guessing light.
    return true;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * The browser chrome colour, for phones where the address bar sits against the
 * page. On auto we remove our override so index.html's media-query pair applies;
 * on an explicit choice ours must come *first* in the head, because the HTML spec
 * takes the first `theme-color` whose media matches and those two always match
 * one or the other.
 */
function applyThemeColor(resolved: ResolvedTheme, auto: boolean): void {
  if (typeof document === "undefined") return;

  const existing = document.getElementById(THEME_COLOR_ID) as HTMLMetaElement | null;
  if (auto) {
    existing?.remove();
    return;
  }

  const meta = existing ?? document.createElement("meta");
  meta.id = THEME_COLOR_ID;
  meta.setAttribute("name", "theme-color");
  meta.setAttribute("content", THEME_COLORS[resolved]);
  if (!existing) document.head.insertBefore(meta, document.head.firstChild);
}

export interface Theme {
  choice: Ref<ThemeChoice>;
  /** What "auto" currently means, for anything that needs the real answer. */
  resolved: ComputedRef<ResolvedTheme>;
  label: ComputedRef<string>;
  cycle: () => void;
}

/**
 * Reads the stored choice, applies it to the document, and keeps following the
 * device while the choice is "auto".
 *
 * The attribute is all the stylesheet needs: main.css holds the dark palette on
 * `:root`, applies the light one when the device asks and dark has not been
 * forced, and again on an explicit `[data-theme="light"]`.
 */
export function useTheme(): Theme {
  const choice = ref<ThemeChoice>(readStoredTheme());
  const prefersDark = ref(systemPrefersDark());
  const resolved = computed(() => resolveTheme(choice.value, prefersDark.value));

  const query =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;

  if (query) {
    const onChange = (event: MediaQueryListEvent): void => {
      prefersDark.value = event.matches;
    };
    query.addEventListener("change", onChange);
    onScopeDispose(() => query.removeEventListener("change", onChange));
  }

  watch(
    [choice, resolved],
    () => {
      if (typeof document !== "undefined") {
        const root = document.documentElement;
        if (choice.value === "auto") delete root.dataset.theme;
        else root.dataset.theme = choice.value;
      }
      applyThemeColor(resolved.value, choice.value === "auto");
    },
    { immediate: true },
  );

  function cycle(): void {
    choice.value = nextTheme(choice.value);
    storeTheme(choice.value);
  }

  return { choice, resolved, label: computed(() => themeLabel(choice.value)), cycle };
}
