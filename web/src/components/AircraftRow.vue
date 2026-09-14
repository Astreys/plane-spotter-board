<script setup lang="ts">
import { computed } from "vue";
import type { CategoryId, InboundAircraft } from "../api";
import AircraftPhoto from "./AircraftPhoto.vue";

const props = defineProps<{ aircraft: InboundAircraft; showPhotos: boolean }>();

/** Categories worth a badge. Everything is a widebody or other; those are noise. */
const HIGHLIGHT: CategoryId[] = ["RARE", "DOUBLE_DECK", "QUAD", "FREIGHTER"];
const LABELS: Record<string, string> = {
  RARE: "rare",
  DOUBLE_DECK: "double deck",
  QUAD: "quad",
  FREIGHTER: "freight",
};

const badges = computed(() => props.aircraft.categories.filter((id) => HIGHLIGHT.includes(id)));

const eta = computed(() => {
  const minutes = props.aircraft.minutesOut;
  if (minutes === null) return { value: "--", unit: "min" };
  if (minutes < 1) return { value: "<1", unit: "min" };
  return { value: String(minutes), unit: "min" };
});

const altitude = computed(() => {
  const alt = props.aircraft.altitudeFt;
  return alt === null ? "--" : `${alt.toLocaleString()} ft`;
});

const descent = computed(() => {
  const rate = props.aircraft.verticalRateFpm;
  if (rate === null) return null;
  if (rate < -200) return "descending";
  if (rate > 200) return "climbing";
  return "level";
});

/**
 * The name leads the row. An unmapped code has no name to lead with, so the raw
 * code takes the headline instead — never a placeholder, and never nothing.
 */
const headline = computed(
  () => props.aircraft.typeName ?? props.aircraft.type ?? "Unknown type",
);

/** True when the headline is a raw code, which reads better in monospace. */
const headlineIsCode = computed(() => !props.aircraft.typeName && !!props.aircraft.type);

/** Only worth repeating in the metadata when the headline is the name. */
const code = computed(() => (props.aircraft.typeName ? props.aircraft.type : null));

const codeOf = (airport: { iata: string | null; icao: string | null } | null): string =>
  airport?.iata ?? airport?.icao ?? "?";

/** Only render the line when there is an actual pair to show. */
const route = computed(() => {
  const value = props.aircraft.route;
  if (!value || (!value.origin && !value.destination)) return null;
  return value;
});

const from = computed(() => codeOf(route.value?.origin ?? null));
const to = computed(() => codeOf(route.value?.destination ?? null));

/**
 * Where it started is the part a spotter actually wants, but it is also the part
 * most likely to be wrong: a route we cannot vouch for is the flight number's
 * usual leg, not this one. The codes stay, dimmed and marked; the friendly name
 * is dropped, because "Montréal" reads as a fact in a way "YUL" does not.
 */
const originCity = computed(() =>
  route.value?.arrivesHere ? (route.value.origin?.city ?? route.value.origin?.name ?? null) : null,
);

/**
 * Spelled out on hover, and used as the accessible label — "CYYZ to CYVR" reads
 * as nothing at all to a screen reader.
 */
const routeLabel = computed(() => {
  const value = route.value;
  if (!value) return "";
  const origin = value.origin?.name ?? value.origin?.city ?? from.value;
  const destination = value.destination?.name ?? value.destination?.city ?? to.value;
  const base = `From ${origin} to ${destination}`;
  if (value.source === "schedule") return `${base}, from today's arrivals schedule.`;
  return value.arrivesHere
    ? base
    : `${base}. This is the scheduled route for callsign ${props.aircraft.callsign ?? ""}`.trim() +
        ", which does not end at this airport — it may be a different leg.";
});
</script>

<template>
  <li class="row" :class="{ 'row--rare': aircraft.categories.includes('RARE') }">
    <div class="row__eta">
      <span class="row__eta-value">{{ eta.value }}</span>
      <span class="row__eta-unit">{{ eta.unit }}</span>
    </div>

    <AircraftPhoto v-if="showPhotos" :hex="aircraft.hex" />

    <div class="row__body">
      <div class="row__top">
        <span class="row__name" :class="{ 'row__name--code': headlineIsCode }">
          {{ headline }}
        </span>
        <span class="row__callsign">{{ aircraft.callsign ?? "no callsign" }}</span>
        <span v-for="badge in badges" :key="badge" class="row__badge" :data-badge="badge">
          {{ LABELS[badge] }}
        </span>
      </div>

      <div class="row__meta">
        <span v-if="code" class="row__code">{{ code }}</span>
        <span v-if="aircraft.registration">{{ aircraft.registration }}</span>
        <span>{{ altitude }}</span>
        <span>{{ aircraft.distanceNm }} nm {{ aircraft.fromDirection }}</span>
        <span v-if="descent" class="row__descent" :data-state="descent">{{ descent }}</span>
      </div>

      <div
        v-if="route"
        class="row__route"
        :class="{ 'row__route--elsewhere': !route.arrivesHere }"
        :title="routeLabel"
      >
        <span class="row__route-pair" :aria-label="routeLabel">
          <span class="row__airport">{{ from }}</span>
          <span class="row__arrow" aria-hidden="true">→</span>
          <span class="row__airport">{{ to }}</span>
        </span>
        <span v-if="originCity" class="row__route-city">{{ originCity }}</span>
        <span v-if="!route.arrivesHere" class="row__route-flag">scheduled</span>
      </div>
    </div>
  </li>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.65rem 0.9rem;
  border-bottom: 1px solid var(--line);
}

.row--rare {
  background: linear-gradient(90deg, color-mix(in srgb, var(--rare) 12%, transparent), transparent);
}

.row__eta {
  flex: 0 0 auto;
  width: 3rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1;
}

.row__eta-value {
  font-size: 1.5rem;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}

.row__eta-unit {
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: var(--muted);
  margin-top: 0.15rem;
}

.row__body {
  min-width: 0;
  flex: 1 1 auto;
}

.row__top {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.row__name {
  font-size: 0.95rem;
  font-weight: 650;
  letter-spacing: -0.01em;
  color: var(--text);
}

/* An unmapped code is the headline; monospace signals it is a code, not a name. */
.row__name--code {
  font-family: var(--mono);
  font-weight: 600;
  letter-spacing: 0.02em;
}

.row__callsign {
  font-size: 0.88rem;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row__code {
  font-family: var(--mono);
  letter-spacing: 0.02em;
  color: var(--muted-2);
}

.row__badge {
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  background: var(--surface-2);
  color: var(--muted);
}

.row__badge[data-badge="RARE"] {
  background: color-mix(in srgb, var(--rare) 22%, transparent);
  color: var(--rare);
}

.row__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.15rem 0.6rem;
  margin-top: 0.2rem;
  font-size: 0.76rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.row__descent[data-state="descending"] {
  color: var(--good);
}

.row__route {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.15rem 0.45rem;
  margin-top: 0.2rem;
  font-size: 0.76rem;
  min-width: 0;
}

.row__route-pair {
  display: inline-flex;
  align-items: baseline;
  gap: 0.3rem;
  font-family: var(--mono);
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--text);
}

.row__arrow {
  color: var(--muted-2);
  font-weight: 400;
}

.row__route-city {
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/*
 * The scheduled route does not end at the airport being watched. Shown, because
 * hiding it would lose real information, but dimmed and flagged so it is never
 * read as "this aircraft came from there just now".
 */
.row__route--elsewhere .row__route-pair {
  color: var(--muted);
  font-weight: 500;
}

.row__route-flag {
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
  background: var(--surface-2);
  color: var(--muted-2);
}

</style>
