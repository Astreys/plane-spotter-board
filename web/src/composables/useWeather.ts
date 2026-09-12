import { onScopeDispose, ref, shallowRef, watch, type Ref, type ShallowRef } from "vue";
import { fetchWeather, type WeatherSnapshot } from "../api";

/**
 * How often to re-read the server's weather cache. Every minute, because the card
 * shows the report's age and a slower read would let "29 min ago" fall minutes
 * behind the truth. It costs nothing upstream: it reads our own server's cache,
 * and only the server ever talks to aviationweather.gov.
 */
const REFRESH_MS = 60_000;

/** A server that has only just started can answer before its first fetch lands. */
const LOADING_RETRY_MS = 1_500;
const LOADING_RETRIES = 6;

/**
 * Weather for the selected airport, read from the server's cache. Does nothing
 * at all when the server says weather is switched off.
 */
export function useWeather(
  icao: () => string,
  enabled: () => boolean,
): { snapshot: ShallowRef<WeatherSnapshot | null>; failed: Ref<boolean> } {
  const snapshot = shallowRef<WeatherSnapshot | null>(null);
  /** The board API itself could not be reached, as opposed to having no report. */
  const failed = ref(false);

  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function cancel(): void {
    controller?.abort();
    controller = null;
    if (timer) clearTimeout(timer);
    timer = null;
  }

  async function load(code: string, attempt = 0): Promise<void> {
    cancel();
    controller = new AbortController();

    try {
      const result = await fetchWeather(code, controller.signal);
      snapshot.value = result;
      failed.value = false;

      const retrying = result.loading && attempt < LOADING_RETRIES;
      timer = setTimeout(
        () => void load(code, retrying ? attempt + 1 : 0),
        retrying ? LOADING_RETRY_MS : REFRESH_MS,
      );
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      failed.value = true;
      timer = setTimeout(() => void load(code), REFRESH_MS);
    }
  }

  watch(
    [icao, enabled],
    ([code, on]) => {
      cancel();
      // Never show one airport's weather under another's name while the next loads.
      snapshot.value = null;
      failed.value = false;
      if (on && code) void load(code);
    },
    { immediate: true },
  );

  onScopeDispose(cancel);

  return { snapshot, failed };
}
