<script setup lang="ts">
import { computed } from "vue";
import type { WeatherSnapshot } from "../api";
import { formatReportAge, formatTemperature, formatVisibility, formatWind } from "../weather";
import WeatherIcon from "./WeatherIcon.vue";

const props = defineProps<{ snapshot: WeatherSnapshot | null }>();

const observation = computed(() => props.snapshot?.observation ?? null);
</script>

<!--
  The phone's stand-in for the weather card: temperature, wind and visibility on
  one line, the three things worth knowing at the fence. It renders nothing at all
  while loading or when there is no current report - on a phone every line above
  the list costs a row, and "no weather" is not worth one.
-->
<template>
  <div v-if="observation" class="wx-strip">
    <div class="wx-strip__inner">
      <WeatherIcon :icon="observation.icon" :is-day="observation.isDay" :size="22" />
      <span class="wx-strip__hidden">{{ observation.condition }},</span>
      <span class="wx-strip__temp">{{ formatTemperature(observation.temperatureC) }}</span>
      <span class="wx-strip__sep" aria-hidden="true">·</span>
      <span>{{ formatWind(observation.wind) }}</span>
      <span class="wx-strip__sep" aria-hidden="true">·</span>
      <span>{{ formatVisibility(observation.visibilityKm, observation.visibilityOrMore) }}</span>
      <span v-if="snapshot?.stale" class="wx-strip__stale">
        {{ formatReportAge(snapshot.ageSeconds) }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.wx-strip {
  background: var(--surface);
  border-bottom: 1px solid var(--line);
}

.wx-strip__inner {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.25rem 0.45rem;
  max-width: var(--shell-max);
  margin: 0 auto;
  padding: 0.4rem var(--shell-gutter);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
}

.wx-strip__temp {
  font-weight: 600;
}

.wx-strip__sep {
  color: var(--muted-2);
}

.wx-strip__stale {
  margin-left: auto;
  font-size: 0.72rem;
  color: var(--warn);
}

/* The icon carries the condition for sighted readers; this says it for everyone else. */
.wx-strip__hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/*
 * At 65rem the card rail appears with the full weather card, and this would only
 * repeat it. The width matches the ladder in main.css.
 */
@media (min-width: 65rem) {
  .wx-strip {
    display: none;
  }
}
</style>
