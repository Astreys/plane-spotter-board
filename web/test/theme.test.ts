import { afterEach, describe, expect, it, vi } from "vitest";
import {
  THEME_COLORS,
  THEME_STORAGE_KEY,
  isThemeChoice,
  nextTheme,
  readStoredTheme,
  resolveTheme,
  storeTheme,
  themeLabel,
} from "../src/theme";

afterEach(() => {
  // Unstub first: the blocked-storage test leaves a localStorage with no clear().
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("nextTheme", () => {
  it("cycles auto, light, dark and back", () => {
    expect(nextTheme("auto")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("auto");
  });

  it("recovers from a value it does not recognise", () => {
    expect(nextTheme("sideways" as never)).toBe("auto");
  });
});

describe("resolveTheme", () => {
  it("follows the device when set to auto", () => {
    expect(resolveTheme("auto", true)).toBe("dark");
    expect(resolveTheme("auto", false)).toBe("light");
  });

  it("ignores the device once a choice is made", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("the stored choice", () => {
  it("round-trips through storage", () => {
    storeTheme("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(readStoredTheme()).toBe("dark");
  });

  it("falls back to auto when nothing is stored", () => {
    expect(readStoredTheme()).toBe("auto");
  });

  it("falls back to auto for a value it cannot use", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "neon");
    expect(readStoredTheme()).toBe("auto");
  });

  it("survives storage being blocked entirely", () => {
    // Private browsing throws on access rather than returning null.
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("denied");
      },
      setItem() {
        throw new Error("denied");
      },
    });

    expect(readStoredTheme()).toBe("auto");
    expect(() => storeTheme("dark")).not.toThrow();
  });
});

describe("isThemeChoice", () => {
  it("accepts the three choices and nothing else", () => {
    expect(isThemeChoice("auto")).toBe(true);
    expect(isThemeChoice("light")).toBe(true);
    expect(isThemeChoice("dark")).toBe(true);
    expect(isThemeChoice("")).toBe(false);
    expect(isThemeChoice(null)).toBe(false);
  });
});

describe("themeLabel", () => {
  it("says what the button will do next, not just where it is", () => {
    expect(themeLabel("auto")).toBe("Theme: following your device. Switch to light");
    expect(themeLabel("dark")).toBe("Theme: dark. Switch to following your device");
  });
});

describe("THEME_COLORS", () => {
  it("matches the page background in main.css", () => {
    // If --bg changes, these follow, or the browser chrome stops matching the page.
    expect(THEME_COLORS.dark).toBe("#0b1017");
    expect(THEME_COLORS.light).toBe("#f6f8fb");
  });
});
