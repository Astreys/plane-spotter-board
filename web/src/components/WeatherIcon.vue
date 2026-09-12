<script setup lang="ts">
import { computed } from "vue";
import type { WeatherIcon } from "../api";

const props = withDefaults(
  defineProps<{
    /** Chosen on the server from the METAR, so this component knows no weather codes. */
    icon: WeatherIcon;
    isDay: boolean;
    size?: number;
  }>(),
  { size: 48 },
);

const CLOUD = "M15 37h21a7 7 0 0 0 1-13.9a10 10 0 0 0-19.4-2.6A7.5 7.5 0 0 0 15 37z";

/**
 * Each icon is assembled from a few shared parts rather than drawn whole, so the
 * day and night versions differ only in the sun or moon, and a new icon is a line
 * here rather than a new drawing.
 */
const parts = computed(() => {
  const icon = props.icon;
  const withBody = ["mostly-clear", "partly-cloudy", "showers"];
  const withCloud = ["partly-cloudy", "mostly-cloudy", "overcast", "showers", "rain", "snow", "thunder"];
  return {
    body: icon === "clear" || icon === "haze" ? "full" : withBody.includes(icon) ? "peek" : null,
    cloud: icon === "mostly-clear" ? "small" : withCloud.includes(icon) ? "big" : null,
    backCloud: icon === "mostly-cloudy" || icon === "overcast",
    darkCloud: ["overcast", "rain", "snow", "thunder"].includes(icon),
    drops: icon === "showers" || icon === "rain",
    flakes: icon === "snow",
    bolt: icon === "thunder",
    fog: icon === "fog",
    haze: icon === "haze",
  };
});
</script>

<template>
  <svg
    class="wx-icon"
    :width="size"
    :height="size"
    viewBox="0 0 48 48"
    aria-hidden="true"
    focusable="false"
  >
    <g
      v-if="parts.body"
      :transform="parts.body === 'peek' ? 'translate(17 16) scale(0.72) translate(-24 -24)' : undefined"
    >
      <g v-if="isDay" class="wx-icon__sun">
        <circle cx="24" cy="24" r="8" />
        <path
          d="M24 9v4M24 35v4M9 24h4M35 24h4M13.4 13.4l2.8 2.8M31.8 31.8l2.8 2.8M13.4 34.6l2.8-2.8M31.8 16.2l2.8-2.8"
        />
      </g>
      <path v-else class="wx-icon__moon" d="M28.5 11.5a12.5 12.5 0 1 0 8 20.5a10 10 0 0 1-8-20.5z" />
    </g>

    <path v-if="parts.backCloud" class="wx-icon__cloud wx-icon__cloud--back" :d="CLOUD" transform="translate(-6 -7)" />
    <path
      v-if="parts.cloud"
      class="wx-icon__cloud"
      :class="{ 'wx-icon__cloud--dark': parts.darkCloud }"
      :d="CLOUD"
      :transform="parts.cloud === 'small' ? 'translate(31 33) scale(0.55) translate(-26 -29)' : undefined"
    />

    <path v-if="parts.drops" class="wx-icon__rain" d="M19 40l-2 5M26 40l-2 5M33 40l-2 5" />
    <g v-if="parts.flakes" class="wx-icon__snow">
      <circle cx="18" cy="42" r="1.7" />
      <circle cx="25" cy="45" r="1.7" />
      <circle cx="32" cy="42" r="1.7" />
    </g>
    <path v-if="parts.bolt" class="wx-icon__bolt" d="M27 36l-6 7h4.5l-2.5 5 7-8h-4.5l2.5-4z" />
    <path v-if="parts.fog" class="wx-icon__line" d="M9 20h30M12 26h26M9 32h28M13 38h22" />
    <path v-if="parts.haze" class="wx-icon__line" d="M9 36h30M13 41h22" />
  </svg>
</template>

<style scoped>
/*
 * Colours come from the theme tokens, so the icon reads in both schemes: clouds
 * are mixed from the text colour, which is light on the dark theme and dark on
 * the light one.
 */
.wx-icon {
  flex: 0 0 auto;
  overflow: visible;
  --wx-cloud: color-mix(in srgb, var(--text) 72%, var(--surface));
  --wx-cloud-dark: color-mix(in srgb, var(--text) 50%, var(--surface));
}

.wx-icon__sun circle {
  fill: var(--warn);
}

.wx-icon__sun path {
  fill: none;
  stroke: var(--warn);
  stroke-width: 2.4;
  stroke-linecap: round;
}

.wx-icon__moon {
  fill: color-mix(in srgb, var(--text) 80%, var(--surface));
}

/* The surface-coloured outline keeps a cloud distinct from whatever sits behind it. */
.wx-icon__cloud {
  fill: var(--wx-cloud);
  stroke: var(--surface);
  stroke-width: 1.5;
}

.wx-icon__cloud--dark,
.wx-icon__cloud--back {
  fill: var(--wx-cloud-dark);
}

.wx-icon__rain {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2.4;
  stroke-linecap: round;
}

.wx-icon__snow {
  fill: var(--accent);
}

.wx-icon__bolt {
  fill: var(--warn);
}

.wx-icon__line {
  fill: none;
  stroke: var(--muted);
  stroke-width: 2.6;
  stroke-linecap: round;
}
</style>
