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
 * Mixed from currentColor rather than hard-coded white, so the button follows the
 * band it sits on: a faint light tint over the dusk sky, a faint dark one over
 * daylight. No second rule needed for the light theme.
 */
.theme {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, currentColor 8%, transparent);
  color: inherit;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;
}

.theme:hover {
  background: color-mix(in srgb, currentColor 16%, transparent);
  border-color: color-mix(in srgb, currentColor 30%, transparent);
}

.theme__icon {
  width: 1.05rem;
  height: 1.05rem;
}

/* A sun wants to look warm against either sky; --warn is tuned per theme already. */
.theme[data-choice="light"] .theme__icon {
  color: var(--warn);
}
</style>
