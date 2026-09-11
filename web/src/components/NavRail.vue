<script setup lang="ts">
defineProps<{
  tab: "live" | "upcoming";
  /** Not every tracked airport has an Upcoming board; a schedule costs units. */
  hasSchedule: boolean;
  rules: { maxDistanceNm: number; maxAltitudeFt: number } | null;
}>();

const emit = defineEmits<{ select: [tab: "live" | "upcoming"] }>();
</script>

<!--
  Desktop-only navigation, and deliberately only the destinations that exist.
  The mockup this came from also listed Search, Airlines and About; those are
  pages nobody has written, and a rail of dead links reads worse than a short one.
-->
<template>
  <nav class="rail" aria-label="Boards">
    <button
      type="button"
      class="rail__item"
      :aria-current="tab === 'live' ? 'page' : undefined"
      @click="emit('select', 'live')"
    >
      <svg class="rail__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5L13 18v-4.5z"
        />
      </svg>
      Inbound
    </button>

    <button
      v-if="hasSchedule"
      type="button"
      class="rail__item"
      :aria-current="tab === 'upcoming' ? 'page' : undefined"
      @click="emit('select', 'upcoming')"
    >
      <svg class="rail__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2zm12 8v9H5v-9z"
        />
      </svg>
      Upcoming
    </button>

    <!-- Real content from /api/config, not filler: it explains what the board omits. -->
    <div v-if="rules" class="rail__note">
      <h2 class="rail__note-title">What counts as inbound</h2>
      <p class="rail__note-body">
        Within {{ rules.maxDistanceNm }} nm of the field, below
        {{ rules.maxAltitudeFt.toLocaleString() }} ft above it, and descending or lined up
        on approach.
      </p>
    </div>
  </nav>
</template>

<style scoped>
/* Sticky lives on the grid item in App.vue; this box is content-height. */
.rail {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.rail__item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-height: 2.6rem;
  padding: 0 0.75rem;
  border: 0;
  border-radius: 10px;
  background: none;
  color: var(--muted);
  font: inherit;
  font-size: 0.88rem;
  font-weight: 550;
  text-align: left;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}

.rail__item:hover {
  background: var(--surface-2);
  color: var(--text);
}

.rail__item[aria-current="page"] {
  background: var(--accent);
  color: var(--accent-ink);
}

.rail__icon {
  flex: 0 0 auto;
  width: 1.05rem;
  height: 1.05rem;
}

.rail__note {
  margin-top: 1.4rem;
  padding-top: 1rem;
  border-top: 1px solid var(--line);
}

.rail__note-title {
  margin: 0 0 0.3rem;
  font-size: 0.66rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}

.rail__note-body {
  margin: 0;
  font-size: 0.74rem;
  line-height: 1.5;
  color: var(--muted-2);
}
</style>
