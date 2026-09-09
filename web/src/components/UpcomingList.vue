<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { fetchUpcoming, type UpcomingFlight, type UpcomingSnapshot } from "../api";

const props = defineProps<{ icao: string; timeZone: string | null }>();

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

function minutesAway(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 60000);
}

/** Group by local day so an overnight window does not read as one long list. */
const groups = computed(() => {
  const flights = snapshot.value?.flights ?? [];
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
</script>

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

      <div v-for="group in groups" :key="group.label" class="upcoming__day">
        <h2 class="upcoming__daylabel">{{ group.label }}</h2>
        <ul class="upcoming__list">
          <li v-for="flight in group.flights" :key="(flight.number ?? flight.callsign) + flight.arrivalTime" class="flight">
            <div class="flight__time">
              <span class="flight__clock">{{ clock(flight.arrivalTime) }}</span>
              <span v-if="flight.arrivalIsRevised" class="flight__revised">revised</span>
              <span v-else-if="minutesAway(flight.arrivalTime) < 90" class="flight__in">
                in {{ minutesAway(flight.arrivalTime) }}m
              </span>
            </div>

            <div class="flight__body">
              <div class="flight__top">
                <span class="flight__name">{{ flight.typeName ?? flight.model ?? "Unknown type" }}</span>
                <span v-for="badge in badgesFor(flight)" :key="badge" class="flight__badge" :data-badge="badge">
                  {{ BADGES[badge] }}
                </span>
              </div>
              <div class="flight__meta">
                <span v-if="flight.type" class="flight__code">{{ flight.type }}</span>
                <span v-if="flight.number">{{ flight.number }}</span>
                <span v-if="flight.origin" class="flight__origin">
                  from {{ flight.origin.iata ?? flight.origin.icao }}
                  <template v-if="flight.origin.name">· {{ flight.origin.name }}</template>
                </span>
              </div>
              <div class="flight__meta flight__meta--dim">
                <span v-if="flight.airline">{{ flight.airline }}</span>
                <span v-if="flight.registration">{{ flight.registration }}</span>
                <span v-if="flight.terminal">T{{ flight.terminal }}</span>
                <span v-if="flight.status">{{ flight.status }}</span>
              </div>
            </div>
          </li>
        </ul>
      </div>

      <p class="upcoming__footnote">
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

.upcoming__daylabel {
  margin: 0;
  padding: 0.5rem 0.9rem 0.35rem;
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: var(--muted);
  background: var(--surface);
  border-bottom: 1px solid var(--line);
}

.upcoming__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.flight {
  display: flex;
  gap: 0.7rem;
  padding: 0.6rem 0.9rem;
  border-bottom: 1px solid var(--line);
}

.flight__time {
  flex: 0 0 auto;
  width: 3.6rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.flight__clock {
  font-family: var(--mono);
  font-size: 1.05rem;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}

.flight__revised,
.flight__in {
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--muted-2);
  margin-top: 0.1rem;
}

.flight__revised {
  color: var(--warn);
}

.flight__body {
  min-width: 0;
  flex: 1 1 auto;
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
  font-size: 0.74rem;
  color: var(--muted);
}

.flight__meta--dim {
  color: var(--muted-2);
  font-size: 0.7rem;
}

.flight__code {
  font-family: var(--mono);
  letter-spacing: 0.02em;
  color: var(--muted-2);
}

.flight__origin {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upcoming__footnote {
  margin: 0;
  padding: 0.9rem;
  font-size: 0.7rem;
  line-height: 1.6;
  color: var(--muted-2);
}
</style>
