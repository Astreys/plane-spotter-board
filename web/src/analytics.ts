/**
 * Google Analytics, loaded at runtime and only when configured.
 *
 * The measurement ID comes from VITE_GA_ID rather than being hardcoded in
 * index.html, for three reasons: `npm run dev` stays silent so local poking
 * around does not pollute the numbers, a fork or a clone sends nothing to an
 * account it does not own, and the deployed site is the only thing that reports.
 *
 * A GA measurement ID is public by design - it ships in the page either way - so
 * the VITE_ prefix is correct here. Nothing secret goes near the bundle.
 */

const MEASUREMENT_ID = import.meta.env.VITE_GA_ID?.trim() ?? "";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** True when analytics is configured and the browser has not asked to opt out. */
export function analyticsEnabled(): boolean {
  if (!MEASUREMENT_ID) return false;
  // Respect Do Not Track. The board loses nothing by not counting someone.
  if (typeof navigator !== "undefined" && navigator.doNotTrack === "1") return false;
  return true;
}

let started = false;

export function startAnalytics(): void {
  if (started || !analyticsEnabled()) return;
  if (typeof document === "undefined") return;
  started = true;

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(MEASUREMENT_ID);
  // A blocked or failed script must never take the board down with it.
  script.onerror = () => {
    started = false;
  };
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer ?? [];
  const gtag: (...args: unknown[]) => void = (...args) => {
    window.dataLayer!.push(args);
  };
  window.gtag = gtag;

  gtag("js", new Date());
  gtag("config", MEASUREMENT_ID);
}
