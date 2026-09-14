<script setup lang="ts">
import { ref, watch } from "vue";
import { initialsFor } from "../airlines";

/**
 * The mark beside an airline's name.
 *
 * Today every board shows a coloured monogram: airline logos are trademarks and
 * we have no licensed source for the artwork. This is the one place that decides
 * how a carrier is shown, so when a licensed source does arrive, a `logoUrl`
 * passed in here is the whole change — no table or card needs touching.
 *
 * A logo that fails to load falls back to the monogram rather than leaving a gap,
 * which also means a lapsed licence degrades quietly instead of breaking rows.
 */
const props = withDefaults(
  defineProps<{
    name: string;
    /** ICAO or IATA code, when known. Used for the colour and as the alt text. */
    code?: string | null;
    /** Set only once there is a licensed source. Null keeps the monogram. */
    logoUrl?: string | null;
    size?: number;
  }>(),
  { code: null, logoUrl: null, size: 26 },
);

const failed = ref(false);
watch(
  () => props.logoUrl,
  () => {
    failed.value = false;
  },
);
</script>

<template>
  <span
    class="mark"
    :style="{ '--mark-size': `${size}px` }"
    :title="code ? `${name} (${code})` : name"
  >
    <img
      v-if="logoUrl && !failed"
      class="mark__logo"
      :src="logoUrl"
      :alt="name"
      loading="lazy"
      decoding="async"
      @error="failed = true"
    />
    <span v-else class="mark__initials" aria-hidden="true">{{ initialsFor(name) }}</span>
  </span>
</template>

<style scoped>
.mark {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: var(--mark-size);
  height: var(--mark-size);
  border-radius: 7px;
  overflow: hidden;
}

/* The colour is per-airline, set by whoever renders the mark. */
.mark__initials {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  background: hsl(var(--mark-hue, 210) 62% 46% / 0.18);
  border: 1px solid hsl(var(--mark-hue, 210) 62% 46% / 0.32);
  border-radius: inherit;
  color: hsl(var(--mark-hue, 210) 68% 62%);
  font-family: var(--mono);
  font-size: calc(var(--mark-size) * 0.4);
  font-weight: 700;
  letter-spacing: 0.02em;
}

/* A logo sits on white: most airline marks assume a light background. */
.mark__logo {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #fff;
  padding: 2px;
}
</style>
