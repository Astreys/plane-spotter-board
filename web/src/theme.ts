/**
 * Which colour scheme the board uses.
 *
 * Three states rather than two: "auto" follows the device, which is what most
 * people want and what the board did before this existed. The two explicit
 * choices are for the cases the device gets wrong — a phone on auto-dark at the
 * fence in daylight, or a bright office at night.
 *
 * Everything here is pure. `useTheme` applies it to the document.
 */

export type ThemeChoice = "auto" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

/** The order the button cycles through. Auto first, because it is the default. */
export const THEME_ORDER: readonly ThemeChoice[] = ["auto", "light", "dark"];

export const THEME_STORAGE_KEY = "psb:theme";

/**
 * Browser chrome colour per resolved theme. These must match `--bg` in
 * main.css — the address bar sitting a shade off the page is worse than it
 * sounds on a phone held at arm's length.
 */
export const THEME_COLORS: Readonly<Record<ResolvedTheme, string>> = {
  dark: "#0b1017",
  light: "#f6f8fb",
};

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === "auto" || value === "light" || value === "dark";
}

export function nextTheme(current: ThemeChoice): ThemeChoice {
  const index = THEME_ORDER.indexOf(current);
  // An unknown value cycles to the start rather than sticking.
  return THEME_ORDER[(index + 1) % THEME_ORDER.length]!;
}

/** What "auto" actually means right now. */
export function resolveTheme(choice: ThemeChoice, systemPrefersDark: boolean): ResolvedTheme {
  if (choice === "auto") return systemPrefersDark ? "dark" : "light";
  return choice;
}

/** Anything unreadable or unrecognised falls back to following the device. */
export function readStoredTheme(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(stored) ? stored : "auto";
  } catch {
    // Private browsing, or storage blocked entirely.
    return "auto";
  }
}

export function storeTheme(choice: ThemeChoice): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // The preference just will not survive a reload.
  }
}

/** For the button's accessible name, which has to say what it will do next. */
export function themeLabel(choice: ThemeChoice): string {
  const names: Record<ThemeChoice, string> = {
    auto: "following your device",
    light: "light",
    dark: "dark",
  };
  return `Theme: ${names[choice]}. Switch to ${names[nextTheme(choice)]}`;
}
