<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { fetchUpcoming, type UpcomingFlight, type UpcomingSnapshot } from "../api";
import { hueFor } from "../airlines";
import { minutesUntil, originOf, statusLabel, statusTone } from "../upcoming";
import { filterUpcoming } from "../search";
import AirlineMark from "./AirlineMark.vue";

const props = withDefaults(
  defineProps<{
    icao: string;
    timeZone: string | null;
    /** The board's filter box. Narrows the flights already fetched; asks for nothing. */
    query?: string;
  }>(),
  { query: "" },
);

const snapshot = ref<UpcomingSnapshot | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
let controller: AbortController | null = null;

/**
 * The server refreshes the schedule every few hours against a metered upstream,
 * so this only reads its cache. Re-fetching on a tab switch costs nothing.
 */
let retryTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * The server fetches a schedule on demand, so the very first view of an airport
 * usually returns "loading" and the data lands a second or two later. Poll a few
 * times to cover that, then stop - this reads the server cache and costs no
 * upstream units whatever the answer.
 */
async function load(attempt = 0): Promise<void> {
  if (retryTimer) clearTimeout(retryTimer);
  controller?.abort();
  controller = new AbortController();
  loading.value = true;
  error.value = null;
  try {
    const result = await fetchUpcoming(props.icao, controller.signal);
    snapshot.value = result;
    if (result.loading && attempt < 6) {
      retryTimer = setTimeout(() => void load(attempt + 1), 1500);
      return;
    }
  } catch (err) {
    if ((err as Error).name !== "AbortError") error.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
}

onMounted(() => void load());
watch(
  () => props.icao,
  () => void load(),
);
onBeforeUnmount(() => {
  controller?.abort();
  if (retryTimer) clearTimeout(retryTimer);
});

/** Local airport time, which is what a spotter standing there is reading. */
function clock(iso: string): string {
  const options: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  if (props.timeZone) options.timeZone = props.timeZone;
  return new Intl.DateTimeFormat("en-CA", options).format(new Date(iso));
}

/** Plain words for how old the schedule is, for the staleness notice. */
const agoText = computed(() => {
  const seconds = snapshot.value?.ageSeconds ?? 0;
  if (seconds < 90) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return minutes + " min ago";
  const hours = Math.round(minutes / 60);
  if (hours < 36) return hours + " hours ago";
  return Math.round(hours / 24) + " days ago";
});

/** The board's filter box, applied to the schedule already fetched. */
const filtered = computed(() => filterUpcoming(snapshot.value?.flights ?? [], props.query));

/** Group by local day so an overnight window does not read as one long list. */
const groups = computed(() => {
  const flights = filtered.value;
  const out: Array<{ label: string; flights: UpcomingFlight[] }> = [];
  for (const flight of flights) {
    const options: Intl.DateTimeFormatOptions = { weekday: "long", month: "short", day: "numeric" };
    if (props.timeZone) options.timeZone = props.timeZone;
    const label = new Intl.DateTimeFormat("en-CA", options).format(new Date(flight.arrivalTime));
    const last = out[out.length - 1];
    if (last && last.label === label) last.flights.push(flight);
    else out.push({ label, flights: [flight] });
  }
  return out;
});

const BADGES: Record<string, string> = {
  DOUBLE_DECK: "double deck",
  QUAD: "quad",
  RARE: "rare",
  FREIGHTER: "freight",
};

const badgesFor = (flight: UpcomingFlight): string[] =>
  flight.categories.filter((id) => id in BADGES);

const keyOf = (flight: UpcomingFlight): string =>
  (flight.number ?? flight.callsign ?? "?") + flight.arrivalTime;

/** The mark's colour follows the airline code when there is one, like the card. */
const markHue = (flight: UpcomingFlight): number =>
  hueFor(flight.airlineIcao ?? flight.airline?.toLowerCase() ?? "");
</script>

<!--
  One table, not a table on desktop and a list on mobile: the same rows restack
  through CSS at narrow widths. Two markups would mean two things to keep correct,
  and a screen reader would read whichever one happened to be in the DOM.
-->
<template>
  <div class="upcoming">
    <p v-if="(loading && !snapshot) || snapshot?.loading" class="upcoming__note">
      Fetching today's schedule...
    </p>

    <p v-else-if="error" class="upcoming__note upcoming__note--error">{{ error }}</p>

    <div v-else-if="snapshot?.unavailable" class="upcoming__empty">
      <p class="upcoming__headline">Schedule out of date</p>
      <p class="upcoming__detail">
        <template v-if="snapshot.updatedAt">
          Last refreshed {{ agoText }}, and the server could not renew it.
          <br />
          {{ snapshot.error }}
        </template>
        <template v-else>{{ snapshot.error ?? "Not configured." }}</template>
      </p>
    </div>

    <div v-else-if="!snapshot?.flights.length" class="upcoming__empty">
      <p class="upcoming__headline">
        Nothing big due in the next {{ snapshot?.windowHours ?? 12 }} hours
      </p>
      <p class="upcoming__detail">
        {{ snapshot?.totalScheduled ?? 0 }} arrivals scheduled, none of them widebody.
      </p>
      <p v-if="snapshot?.stale" class="upcoming__warn">
        Last refreshed {{ agoText }} - this may be out of date.
      </p>
    </div>

    <template v-else>
      <p v-if="snapshot?.stale" class="upcoming__warn upcoming__warn--banner">
        Last refreshed {{ agoText }} - this may be out of date.
      </p>

      <div v-if="!filtered.length" class="upcoming__empty">
        <p class="upcoming__headline">No scheduled arrival matches “{{ query }}”</p>
        <p class="upcoming__detail">
          {{ snapshot.flights.length }} big arrivals are due, and none of them match.
        </p>
      </div>

      <table v-else class="fids">
        <thead class="fids__head">
          <tr>
            <th scope="col" class="fids__th fids__th--time">Arrives</th>
            <th scope="col" class="fids__th">Aircraft</th>
            <th scope="col" class="fids__th fids__th--from">From</th>
            <th scope="col" class="fids__th fids__th--airline">Airline</th>
            <th scope="col" class="fids__th fids__th--status">Status</th>
          </tr>
        </thead>

        <tbody v-for="group in groups" :key="group.label" class="fids__day">
          <tr class="fids__daylabel">
            <th scope="colgroup" colspan="5">{{ group.label }}</th>
          </tr>

          <tr v-for="flight in group.flights" :key="keyOf(flight)" class="flight">
            <td class="flight__time">
              <span class="flight__clock">{{ clock(flight.arrivalTime) }}</span>
              <span v-if="flight.arrivalIsRevised" class="flight__revised">revised</span>
              <span v-else-if="minutesUntil(flight.arrivalTime) < 90" class="flight__in">
                in {{ minutesUntil(flight.arrivalTime) }}m
              </span>
            </td>

            <td class="flight__aircraft">
              <div class="flight__top">
                <span class="flight__name">
                  {{ flight.typeName ?? flight.model ?? "Unknown type" }}
                </span>
                <span
                  v-for="badge in badgesFor(flight)"
                  :key="badge"
                  class="flight__badge"
                  :data-badge="badge"
                >
                  {{ BADGES[badge] }}
                </span>
              </div>
              <div class="flight__meta">
                <span v-if="flight.type" class="flight__code">{{ flight.type }}</span>
                <span v-if="flight.number">{{ flight.number }}</span>
                <span v-if="flight.registration" class="flight__code">
                  {{ flight.registration }}
                </span>
                <span v-if="flight.terminal" class="flight__terminal">T{{ flight.terminal }}</span>
              </div>
            </td>

            <td class="flight__from">
              <template v-if="originOf(flight.origin)">
                <span class="flight__city">{{ originOf(flight.origin)!.name }}</span>
                <span v-if="originOf(flight.origin)!.code" class="flight__code">
                  {{ originOf(flight.origin)!.code }}
                </span>
              </template>
            </td>

            <td class="flight__airline">
              <template v-if="flight.airline">
                <AirlineMark
                  class="flight__mark"
                  :style="{ '--mark-hue': markHue(flight) }"
                  :name="flight.airline"
                  :code="flight.airlineIcao ?? flight.airlineIata"
                  :size="24"
                />
                <span class="flight__airline-name">{{ flight.airline }}</span>
              </template>
            </td>

            <td class="flight__status">
              <span v-if="flight.status" class="pill" :data-tone="statusTone(flight.status)">
                {{ statusLabel(flight.status) }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <p class="upcoming__footnote">
        <template v-if="query && filtered.length">
          Showing {{ filtered.length }} matching “{{ query }}”.
        </template>
        {{ snapshot.flights.length }} of {{ snapshot.totalScheduled }} scheduled arrivals in the
        next {{ snapshot.windowHours }} hours are double deck, quad or widebody. Times are the
        operator schedule, not observed.
      </p>
    </template>
  </div>
</template>

<style scoped>
.upcoming {
  padding-bottom: 1rem;
}

.upcoming__note {
  margin: 1.5rem 0.9rem;
  font-size: 0.85rem;
  color: var(--muted);
}

.upcoming__note--error {
  color: var(--bad);
}

.upcoming__empty {
  padding: 3rem 1.2rem;
  text-align: center;
}

.upcoming__headline {
  margin: 0 0 0.5rem;
  font-size: 1.05rem;
  font-weight: 600;
}

.upcoming__detail {
  margin: 0;
  font-size: 0.82rem;
  color: var(--muted);
  line-height: 1.5;
}

.upcoming__warn {
  margin: 0.6rem 0 0;
  font-size: 0.76rem;
  color: var(--warn);
}

/* Above the list, so an ageing schedule is admitted before it is read. */
.upcoming__warn--banner {
  margin: 0;
  padding: 0.5rem 0.9rem;
  background: color-mix(in srgb, var(--warn) 12%, transparent);
  border-bottom: 1px solid var(--line);
}

.fids {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}

/* The column headings only earn their space once the row is actually a row. */
.fids__head {
  display: none;
}

.fids__th {
  padding: 0.5rem 0.6rem;
  text-align: left;
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
  border-bottom: 1px solid var(--line);
}

.fids__daylabel th {
  padding: 0.5rem 0.9rem 0.35rem;
  text-align: left;
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: var(--muted);
  background: var(--surface);
  border-bottom: 1px solid var(--line);
  border-top: 1px solid var(--line);
}

.flight {
  border-bottom: 1px solid var(--line);
}

.flight td {
  padding: 0.55rem 0.6rem;
  vertical-align: top;
}

.flight__time {
  white-space: nowrap;
}

.flight__clock {
  display: block;
  font-family: var(--mono);
  font-size: 1.05rem;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}

.flight__revised,
.flight__in {
  display: block;
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--muted-2);
  margin-top: 0.1rem;
}

.flight__revised {
  color: var(--warn);
}

.flight__top {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.flight__name {
  font-size: 0.92rem;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.flight__badge {
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0.1rem 0.32rem;
  border-radius: 4px;
  background: var(--surface-2);
  color: var(--muted);
}

.flight__badge[data-badge="RARE"] {
  background: color-mix(in srgb, var(--rare) 22%, transparent);
  color: var(--rare);
}

.flight__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.15rem 0.5rem;
  margin-top: 0.15rem;
  font-size: 0.72rem;
  color: var(--muted);
}

.flight__code {
  font-family: var(--mono);
  letter-spacing: 0.02em;
  color: var(--muted-2);
}

.flight__city {
  display: block;
}

.flight__from .flight__code {
  font-size: 0.72rem;
}

.flight__airline {
  min-width: 0;
}

.flight__mark {
  display: inline-grid;
  vertical-align: middle;
  margin-right: 0.4rem;
}

.flight__airline-name {
  vertical-align: middle;
}

.pill {
  display: inline-block;
  padding: 0.12rem 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 550;
  white-space: nowrap;
  background: var(--surface-2);
  color: var(--muted);
  border: 1px solid transparent;
}

.pill[data-tone="expected"] {
  background: color-mix(in srgb, var(--good) 16%, transparent);
  border-color: color-mix(in srgb, var(--good) 34%, transparent);
  color: var(--good);
}

.pill[data-tone="delayed"] {
  background: color-mix(in srgb, var(--warn) 16%, transparent);
  border-color: color-mix(in srgb, var(--warn) 34%, transparent);
  color: var(--warn);
}

.pill[data-tone="cancelled"] {
  background: color-mix(in srgb, var(--bad) 16%, transparent);
  border-color: color-mix(in srgb, var(--bad) 34%, transparent);
  color: var(--bad);
}

.upcoming__footnote {
  margin: 0;
  padding: 0.9rem;
  font-size: 0.7rem;
  line-height: 1.6;
  color: var(--muted-2);
}

/*
 * Narrow: the row restacks into the shape the phone board already uses - time on
 * the left, everything else beside it - rather than scrolling a table sideways.
 */
@media (max-width: 47.4375rem) {
  .flight {
    display: grid;
    grid-template-columns: 3.6rem minmax(0, 1fr);
    padding: 0.6rem 0.9rem;
  }

  .flight td {
    padding: 0;
  }

  .flight__time {
    grid-row: 1 / span 3;
  }

  .flight__from,
  .flight__airline,
  .flight__status {
    margin-top: 0.15rem;
    font-size: 0.72rem;
    color: var(--muted);
  }

  .flight__city {
    display: inline;
  }

  .flight__city::before {
    content: "from ";
    color: var(--muted-2);
  }

  .flight__from .flight__code {
    margin-left: 0.3rem;
  }

  .flight__status {
    margin-top: 0.3rem;
  }
}

/* Wide enough for real columns: bring the headings back. */
@media (min-width: 47.5rem) {
  .fids__head {
    display: table-header-group;
  }

  /*
   * Give the last three columns their own width, or the aircraft column absorbs
   * every spare pixel and leaves a gully between the type and where it is from.
   */
  .fids__th--time {
    width: 5.5rem;
  }

  .fids__th--from {
    width: 22%;
  }

  .fids__th--airline {
    width: 22%;
  }

  .fids__th--status {
    width: 7.5rem;
  }

  .flight td {
    padding: 0.6rem;
  }

  .fids__th--time,
  .flight__time {
    padding-left: 0.9rem;
  }

  .fids__th--status,
  .flight__status {
    padding-right: 0.9rem;
  }
}
</style>
