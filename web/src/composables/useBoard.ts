import { computed, onScopeDispose, ref, shallowRef, watch } from "vue";
import {
  apiUrl,
  fetchInbound,
  type CategoryId,
  type InboundAircraft,
  type InboundSnapshot,
} from "../api";

export type ConnectionState = "connecting" | "live" | "reconnecting" | "polling";

/**
 * Holds the board for one airport: an SSE subscription, the last snapshot, and a
 * clock so "updated 8s ago" keeps counting between pushes.
 *
 * The stream carries the unfiltered snapshot and filtering happens here in the
 * browser. Tapping a chip is then instant and the chip badges keep showing what is
 * actually out there rather than what survived the filter. The payload is a
 * handful of aircraft, so there is nothing to save by filtering upstream.
 */
export function useBoard(icao: () => string) {
  const snapshot = shallowRef<InboundSnapshot | null>(null);
  const connection = ref<ConnectionState>("connecting");
  const now = ref(Date.now());
  const selected = ref<CategoryId[]>([]);

  let source: EventSource | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let abort: AbortController | null = null;

  const clock = setInterval(() => {
    now.value = Date.now();
  }, 1000);

  function teardown(): void {
    source?.close();
    source = null;
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    abort?.abort();
    abort = null;
  }

  /** Last resort when the event stream will not hold: plain polling. */
  function startPolling(code: string): void {
    if (pollTimer) return;
    connection.value = "polling";

    const pull = async (): Promise<void> => {
      abort?.abort();
      abort = new AbortController();
      try {
        snapshot.value = await fetchInbound(code, abort.signal);
      } catch {
        // Keep whatever we last had on screen; the next tick may succeed.
      }
    };

    void pull();
    pollTimer = setInterval(() => void pull(), 15_000);
  }

  function connect(code: string): void {
    teardown();
    connection.value = "connecting";

    if (typeof EventSource === "undefined") {
      startPolling(code);
      return;
    }

    source = new EventSource(apiUrl(`/api/airport/${code}/stream`));

    source.addEventListener("snapshot", (event) => {
      try {
        snapshot.value = JSON.parse((event as MessageEvent<string>).data) as InboundSnapshot;
        connection.value = "live";
        now.value = Date.now();
      } catch {
        // A truncated frame is not worth tearing the connection down for.
      }
    });

    source.addEventListener("open", () => {
      connection.value = "live";
    });

    source.addEventListener("error", () => {
      // EventSource reconnects on its own unless it is CLOSED, in which case the
      // server refused us outright and retrying the stream will not help.
      if (source?.readyState === EventSource.CLOSED) {
        startPolling(code);
      } else {
        connection.value = "reconnecting";
      }
    });
  }

  watch(
    () => icao(),
    (code) => {
      if (code) connect(code);
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    clearInterval(clock);
    teardown();
  });

  /** Counted from the snapshot timestamp so it keeps ticking between pushes. */
  const ageSeconds = computed(() => {
    const snap = snapshot.value;
    if (!snap || !snap.updatedAt) return null;
    return Math.max(0, Math.round((now.value - snap.updatedAt) / 1000));
  });

  const aircraft = computed<InboundAircraft[]>(() => snapshot.value?.aircraft ?? []);

  function toggle(id: CategoryId): void {
    selected.value = selected.value.includes(id)
      ? selected.value.filter((existing) => existing !== id)
      : [...selected.value, id];
  }

  function clear(): void {
    selected.value = [];
  }

  return {
    snapshot,
    aircraft,
    connection,
    ageSeconds,
    selected,
    toggle,
    clear,
    reconnect: () => connect(icao()),
  };
}
