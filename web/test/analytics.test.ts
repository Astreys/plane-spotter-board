import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Analytics must be inert unless deliberately configured, and must never be able
 * to break the board.
 */

async function load(gaId: string | undefined, doNotTrack: string | null = null) {
  vi.resetModules();
  vi.stubEnv("VITE_GA_ID", gaId ?? "");
  Object.defineProperty(navigator, "doNotTrack", { value: doNotTrack, configurable: true });
  return import("../src/analytics");
}

beforeEach(() => {
  document.head.innerHTML = "";
  delete (window as { dataLayer?: unknown[] }).dataLayer;
  delete (window as { gtag?: unknown }).gtag;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

const gaScripts = () =>
  [...document.head.querySelectorAll("script")].filter((s) =>
    (s.getAttribute("src") ?? "").includes("googletagmanager.com"),
  );

describe("analytics", () => {
  it("does nothing when no measurement ID is configured", async () => {
    const { analyticsEnabled, startAnalytics } = await load(undefined);
    expect(analyticsEnabled()).toBe(false);
    startAnalytics();
    expect(gaScripts()).toHaveLength(0);
    expect(window.gtag).toBeUndefined();
  });

  it("loads the tag when an ID is configured", async () => {
    const { analyticsEnabled, startAnalytics } = await load("G-TESTID123");
    expect(analyticsEnabled()).toBe(true);
    startAnalytics();

    const scripts = gaScripts();
    expect(scripts).toHaveLength(1);
    expect(scripts[0]!.getAttribute("src")).toContain("G-TESTID123");
    expect(scripts[0]!.async).toBe(true);
    expect(typeof window.gtag).toBe("function");
  });

  it("honours Do Not Track", async () => {
    const { analyticsEnabled, startAnalytics } = await load("G-TESTID123", "1");
    expect(analyticsEnabled()).toBe(false);
    startAnalytics();
    expect(gaScripts()).toHaveLength(0);
  });

  it("only ever injects the tag once", async () => {
    const { startAnalytics } = await load("G-TESTID123");
    startAnalytics();
    startAnalytics();
    startAnalytics();
    expect(gaScripts()).toHaveLength(1);
  });

  it("ignores a blank or whitespace-only ID", async () => {
    const { analyticsEnabled } = await load("   ");
    expect(analyticsEnabled()).toBe(false);
  });
});
