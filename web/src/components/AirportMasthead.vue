<script setup lang="ts">
import { computed } from "vue";
import { useClock } from "../composables/useClock";
import { formatAirportTime } from "../time";
import AirportHero from "./AirportHero.vue";
import ThemeToggle from "./ThemeToggle.vue";

const props = defineProps<{
  /** Selected airport, ICAO. Empty until /api/config lands. */
  modelValue: string;
  iata: string;
  name: string;
  timeZone: string | null;
  heroImage: string | null;
  /** Only the tracked ones; an airport you cannot watch has nothing to switch to. */
  airports: Array<{ icao: string; iata: string; name: string; city: string }>;
}>();

const emit = defineEmits<{ "update:modelValue": [icao: string] }>();

const now = useClock();
const clock = computed(() => formatAirportTime(now.value, props.timeZone));

/** One airport is a label, several are a picker. No empty dropdowns. */
const switchable = computed(() => props.airports.length > 1);

function select(event: Event): void {
  emit("update:modelValue", (event.target as HTMLSelectElement).value);
}
</script>

<template>
  <header class="masthead">
    <AirportHero :seed="modelValue || iata || 'unknown'" :image="heroImage" />
    <div class="masthead__scrim" aria-hidden="true"></div>

    <div class="masthead__inner">
      <svg class="masthead__mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5L13 18v-4.5z"
        />
      </svg>

      <div class="masthead__switch" :class="{ 'masthead__switch--static': !switchable }">
        <span class="masthead__iata" aria-hidden="true">{{ iata || "..." }}</span>
        <svg
          v-if="switchable"
          class="masthead__chevron"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path fill="none" stroke="currentColor" stroke-width="2.5" d="m6 9 6 6 6-6" />
        </svg>
        <select
          v-if="switchable"
          class="masthead__select"
          aria-label="Airport"
          :value="modelValue"
          @change="select"
        >
          <option v-for="airport in airports" :key="airport.icao" :value="airport.icao">
            {{ airport.iata }} — {{ airport.name }}
          </option>
        </select>
      </div>

      <div class="masthead__names">
        <h1 class="masthead__name">{{ name || "Loading airport" }}</h1>
        <p class="masthead__tagline">Live flight information</p>
      </div>

      <div class="masthead__clock">
        <span class="masthead__date">{{ clock.date }}</span>
        <span class="masthead__time">
          {{ clock.time }}
          <small v-if="clock.zone" class="masthead__zone">{{ clock.zone }}</small>
        </span>
      </div>

      <ThemeToggle class="masthead__theme" />
    </div>
  </header>
</template>

<style scoped>
.masthead {
  position: relative;
  isolation: isolate;
  color: #f2f6fb;
}

/*
 * Darkens the left half so the airport name stays legible whatever the artwork
 * turns out to be. Real photographs vary far more than the generated band does.
 */
.masthead__scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    rgb(6 12 22 / 0.92) 0%,
    rgb(6 12 22 / 0.72) 42%,
    rgb(6 12 22 / 0.35) 78%,
    rgb(6 12 22 / 0.55) 100%
  );
}

.masthead__inner {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.7rem;
  width: 100%;
  max-width: var(--shell-max);
  margin: 0 auto;
  min-height: 4.9rem;
  padding: 0.7rem var(--shell-gutter);
  padding-top: max(0.7rem, env(safe-area-inset-top));
}

.masthead__mark {
  flex: 0 0 auto;
  width: 1.7rem;
  height: 1.7rem;
  color: var(--accent);
  transform: rotate(45deg);
}

.masthead__switch {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 0.1rem;
}

.masthead__iata {
  font-family: var(--mono);
  font-size: 1.55rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  line-height: 1;
}

.masthead__chevron {
  width: 1rem;
  height: 1rem;
  opacity: 0.75;
}

/*
 * Transparent over the styled text: the picker looks custom but stays a real
 * select, so it gets the native wheel on a phone and keyboard support free.
 */
.masthead__select {
  position: absolute;
  inset: -0.4rem;
  width: calc(100% + 0.8rem);
  opacity: 0;
  cursor: pointer;
  font: inherit;
}

.masthead__switch--static .masthead__iata {
  letter-spacing: 0.02em;
}

.masthead__names {
  min-width: 0;
  flex: 1 1 auto;
  border-left: 1px solid rgb(255 255 255 / 0.18);
  margin-left: 0.3rem;
  padding-left: 0.75rem;
}

.masthead__name {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.masthead__tagline {
  margin: 0;
  font-size: 0.72rem;
  color: rgb(255 255 255 / 0.62);
}

.masthead__clock {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-variant-numeric: tabular-nums;
}

.masthead__date {
  font-size: 0.68rem;
  color: rgb(255 255 255 / 0.62);
}

.masthead__time {
  font-size: 1.35rem;
  font-weight: 600;
  line-height: 1.1;
}

.masthead__zone {
  font-size: 0.62rem;
  font-weight: 500;
  color: rgb(255 255 255 / 0.62);
}

/* Last in the row, so the clock keeps its place as the band's anchor. */
.masthead__theme {
  margin-left: 0.6rem;
}

/* Narrow phones: the date is the first thing to go, the clock the last. */
@media (max-width: 24rem) {
  .masthead__date {
    display: none;
  }

  .masthead__time {
    font-size: 1.1rem;
  }
}

@media (min-width: 47.5rem) {
  .masthead__inner {
    min-height: 6.6rem;
    gap: 0.9rem;
  }

  .masthead__iata {
    font-size: 2rem;
  }

  .masthead__name {
    font-size: 1.32rem;
    font-weight: 650;
  }

  .masthead__tagline {
    font-size: 0.78rem;
  }

  .masthead__time {
    font-size: 1.7rem;
  }

  .masthead__date {
    font-size: 0.74rem;
  }

  .masthead__zone {
    font-size: 0.68rem;
  }
}
</style>
