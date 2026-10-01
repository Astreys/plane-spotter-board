<script setup lang="ts">
import { useTheme } from "../composables/useTheme";

/**
 * One button, three states: follow the device, force light, force dark.
 *
 * A cycling button rather than three controls, because it lives in the masthead
 * where a phone has no room for a segmented control — and because the state is
 * visible in the page itself, so the icon only has to say which rule is in force.
 */
const { choice, label, cycle } = useTheme();
</script>

<template>
  <button
    type="button"
    class="theme"
    :aria-label="label"
    :title="label"
    :data-choice="choice"
    @click="cycle"
  >
    <svg class="theme__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <!-- Auto: a disc half in shadow, the usual shorthand for "follow the device". -->
      <template v-if="choice === 'auto'">
        <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8" />
        <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" />
      </template>

      <!-- Light: a sun. -->
      <template v-else-if="choice === 'light'">
        <circle cx="12" cy="12" r="4.6" fill="currentColor" />
        <path
          d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.4 5.4l1.9 1.9M16.7 16.7l1.9 1.9M5.4 18.6l1.9-1.9M16.7 7.3l1.9-1.9"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
        />
      </template>

      <!-- Dark: a crescent moon. -->
      <path v-else d="M20 14.5A8.6 8.6 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" fill="currentColor" />
    </svg>
  </button>
</template>

<style scoped>
/*
 * The masthead band stays dark in both schemes, so this button is coloured for
 * the band rather than from the theme tokens.
 */
.theme {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 1px solid rgb(255 255 255 / 0.16);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.06);
  color: inherit;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;
}

.theme:hover {
  background: rgb(255 255 255 / 0.14);
  border-color: rgb(255 255 255 / 0.28);
}

.theme__icon {
  width: 1.05rem;
  height: 1.05rem;
}

.theme[data-choice="light"] .theme__icon {
  color: #ffd27d;
}
</style>
