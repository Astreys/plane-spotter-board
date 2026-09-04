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
        <span class="row__type">{{ aircraft.type ?? "?" }}</span>
        <span class="row__callsign">{{ aircraft.callsign ?? "no callsign" }}</span>
        <span v-for="badge in badges" :key="badge" class="row__badge" :data-badge="badge">
          {{ LABELS[badge] }}
        </span>
      </div>

      <div class="row__meta">
        <span v-if="aircraft.registration">{{ aircraft.registration }}</span>
        <span>{{ altitude }}</span>
        <span>{{ aircraft.distanceNm }} nm {{ aircraft.fromDirection }}</span>
        <span v-if="descent" class="row__descent" :data-state="descent">{{ descent }}</span>
      </div>

      <div v-if="aircraft.typeName" class="row__typename">{{ aircraft.typeName }}</div>
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

.row__type {
  font-family: var(--mono);
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.row__callsign {
  font-size: 0.95rem;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.row__typename {
  margin-top: 0.15rem;
  font-size: 0.72rem;
  color: var(--muted-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
