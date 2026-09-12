<script setup lang="ts">
import { computed } from "vue";

/**
 * The picture behind the masthead, and the thumbnail on the airport card.
 *
 * Real per-airport artwork is not drawn yet, so this generates a dusk skyline
 * from the ICAO code instead. That is deliberate rather than a stopgap shrug: it
 * ships no binary assets, it scales to any airport added to the registry, and
 * each field gets a recognisably different horizon, so the airport switcher
 * visibly does something.
 *
 * When artwork arrives it is a one-field change - set `heroImage` on the airport
 * in server/src/config/airports.ts and it flows through /api/config to the
 * `image` prop here. Nothing else moves.
 */

const props = withDefaults(
  defineProps<{
    /** Whatever the airport should be drawn from - the ICAO code in practice. */
    seed: string;
    /** Real artwork once there is any. Null falls back to the generated band. */
    image?: string | null;
    variant?: "band" | "card";
  }>(),
  { image: null, variant: "band" },
);

/** FNV-1a seed into a small LCG. Same code in, same skyline out, every render. */
function makeRandom(seed: string): () => number {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    state ^= seed.charCodeAt(i);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const round = (value: number): string => value.toFixed(1);

/**
 * Sky hue moves only within a narrow dusk range and the horizon stays warm, so
 * five airports read as five views of the same evening rather than five themes.
 */
const palette = computed(() => {
  const random = makeRandom(props.seed + "sky");
  return {
    sky: Math.round(205 + random() * 40),
    glow: Math.round(12 + random() * 34),
  };
});

const skyline = computed(() => {
  const random = makeRandom(props.seed);
  const parts: string[] = [];
  let x = -12;

  while (x < 1200) {
    const width = 24 + random() * 52;
    const height = 14 + random() * 60;
    parts.push(`M${round(x)} 200V${round(200 - height)}h${round(width)}V200Z`);
    x += width + 3 + random() * 14;
  }

  return parts.join("");
});

/** One control tower, so the horizon reads as an airfield and not just a city. */
const tower = computed(() => {
  const random = makeRandom(props.seed + "tower");
  const x = Math.round(140 + random() * 880);
  return [
    `M${x - 5} 200V140h10V200Z`,
    `M${x - 17} 140L${x - 12} 123H${x + 12}L${x + 17} 140Z`,
    `M${x - 1} 123V106h2V123Z`,
  ].join("");
});
</script>

<template>
  <div
    class="hero"
    :class="`hero--${variant}`"
    :style="{ '--hero-sky': palette.sky, '--hero-glow': palette.glow }"
  >
    <!-- Decorative in both variants: the airport is named in text beside it. -->
    <img v-if="image" class="hero__image" :src="image" alt="" loading="lazy" decoding="async" />

    <svg
      v-else
      class="hero__art"
      viewBox="0 0 1200 200"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <path class="hero__skyline" :d="skyline" />
      <path class="hero__skyline" :d="tower" />
    </svg>
  </div>
</template>

<style scoped>
/*
 * The band stays dark in both colour schemes. A dusk sky lightened for the light
 * theme looks washed out, and the header text is sized to sit on something dark.
 */
.hero {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background:
    radial-gradient(
      120% 96% at 74% 120%,
      hsl(var(--hero-glow) 88% 58% / 0.5),
      transparent 62%
    ),
    linear-gradient(
      180deg,
      hsl(var(--hero-sky) 56% 10%) 0%,
      hsl(var(--hero-sky) 48% 18%) 58%,
      hsl(var(--hero-sky) 42% 26%) 100%
    );
}

.hero__image,
.hero__art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.hero__image {
  object-fit: cover;
}

.hero__skyline {
  fill: hsl(var(--hero-sky) 62% 7% / 0.9);
}

.hero--card .hero__skyline {
  fill: hsl(var(--hero-sky) 62% 7% / 0.82);
}
</style>
