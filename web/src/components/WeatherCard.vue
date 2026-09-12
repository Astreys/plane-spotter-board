<script setup lang="ts">
import { computed } from "vue";
import type { WeatherSnapshot } from "../api";
import {
  formatCloudBase,
  formatHumidity,
  formatReportAge,
  formatTemperature,
  formatVisibility,
  formatWind,
} from "../weather";
import WeatherIcon from "./WeatherIcon.vue";

const props = defineProps<{
  snapshot: WeatherSnapshot | null;
  /** The board API could not be reached at all. */
  failed: boolean;
  iata: string;
}>();

const observation = computed(() => props.snapshot?.observation ?? null);
const age = computed(() => formatReportAge(props.snapshot?.ageSeconds ?? null));
const loading = computed(() => !props.failed && (!props.snapshot || props.snapshot.loading));

/**
 * Stale means one of two things, and the fix differs: the station has not issued
 * a newer report, or we could not fetch one. The server only sets an error for
 * the second.
 */
const warning = computed(() => {
  const snapshot = props.snapshot;
  if (!snapshot?.stale) return null;
  return snapshot.error
    ? `Could not refresh the report: ${snapshot.error}.`
    : "A newer report is overdue.";
});
</script>

<!--
  The mockup put the details in a column beside the temperature. At rail width
  "Broken 14,000 ft" and a gusting wind do not fit a half-column, so they sit in
  a two-by-two grid underneath instead.
-->
<template>
  <section class="card card--pad weather" :aria-label="`Weather at ${iata}`">
    <template v-if="observation">
      <div class="weather__now">
        <WeatherIcon :icon="observation.icon" :is-day="observation.isDay" :size="52" />
        <div class="weather__summary">
          <p class="weather__temp">{{ formatTemperature(observation.temperatureC) }}</p>
          <p class="weather__condition">{{ observation.condition }}</p>
        </div>
      </div>

      <p class="weather__observed" :class="{ 'weather__observed--stale': snapshot?.stale }">
        Observed at {{ iata }} · {{ age }}
      </p>

      <dl class="weather__details">
        <div class="weather__detail">
          <dt>Wind</dt>
          <dd>{{ formatWind(observation.wind) }}</dd>
        </div>
        <div class="weather__detail">
          <dt>Humidity</dt>
          <dd>{{ formatHumidity(observation.humidityPct) }}</dd>
        </div>
        <div class="weather__detail">
          <dt>Visibility</dt>
          <dd>{{ formatVisibility(observation.visibilityKm, observation.visibilityOrMore) }}</dd>
        </div>
        <div class="weather__detail">
          <dt>Cloud base</dt>
          <dd>{{ formatCloudBase(observation.cloudBase) }}</dd>
        </div>
      </dl>

      <p v-if="warning" class="weather__warning">{{ warning }}</p>

      <!-- For the pilots and the curious. The card above is a translation of this. -->
      <details v-if="observation.raw" class="weather__raw">
        <summary>Raw METAR</summary>
        <code>{{ observation.raw }}</code>
      </details>
    </template>

    <p v-else-if="loading" class="weather__empty">Fetching the latest report...</p>

    <!-- No weather rather than old weather: an expired report is never shown as current. -->
    <div v-else class="weather__empty">
      <p class="weather__empty-title">No current weather report</p>
      <p class="weather__empty-detail">
        <template v-if="failed">Could not reach the board API.</template>
        <template v-else-if="snapshot?.ageSeconds">{{ iata }} last reported {{ age }}.</template>
        <template v-else-if="snapshot?.error">{{ snapshot.error }}</template>
      </p>
    </div>
  </section>
</template>

<style scoped>
.weather__now {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.weather__summary {
  min-width: 0;
}

.weather__temp {
  margin: 0;
  font-size: 1.9rem;
  font-weight: 600;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.weather__condition {
  margin: 0.3rem 0 0;
  font-size: 0.86rem;
}

.weather__observed {
  margin: 0.65rem 0 0;
  font-size: 0.72rem;
  color: var(--muted-2);
}

.weather__observed--stale,
.weather__warning {
  color: var(--warn);
}

.weather__details {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem 0.8rem;
  margin: 0.8rem 0 0;
  padding-top: 0.75rem;
  border-top: 1px solid var(--line);
}

.weather__detail {
  min-width: 0;
}

.weather__detail dt {
  font-size: 0.64rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}

.weather__detail dd {
  margin: 0.12rem 0 0;
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
}

.weather__warning {
  margin: 0.7rem 0 0;
  font-size: 0.72rem;
}

.weather__raw {
  margin-top: 0.7rem;
  font-size: 0.7rem;
  color: var(--muted);
}

.weather__raw summary {
  cursor: pointer;
}

.weather__raw code {
  display: block;
  margin-top: 0.35rem;
  font-family: var(--mono);
  font-size: 0.68rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.weather__empty {
  margin: 0;
  font-size: 0.78rem;
  color: var(--muted);
}

.weather__empty-title {
  margin: 0;
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--text);
}

.weather__empty-detail {
  margin: 0.25rem 0 0;
  font-size: 0.74rem;
}
</style>
