<script setup lang="ts">
import { computed } from "vue";
import type { ConnectionState } from "../composables/useBoard";

const props = defineProps<{
  connection: ConnectionState;
  ageSeconds: number | null;
  stale: boolean;
  error: string | null;
  tracked: number;
  shown: number;
}>();

/** The whole point of the indicator is knowing whether to trust what you see. */
const age = computed(() => {
  if (props.ageSeconds === null) return "waiting for data";
  if (props.ageSeconds < 5) return "updated just now";
  if (props.ageSeconds < 90) return `updated ${props.ageSeconds}s ago`;
  return `updated ${Math.round(props.ageSeconds / 60)} min ago`;
});

const state = computed(() => {
  if (props.error) return "error";
  if (props.stale) return "stale";
  if (props.connection === "live" || props.connection === "polling") return "ok";
  return "waiting";
});
</script>

<template>
  <div class="status" :data-state="state">
    <span class="status__dot" aria-hidden="true"></span>
    <span class="status__age">{{ age }}</span>
    <span class="status__sep">·</span>
    <span>{{ shown }} of {{ tracked }} inbound</span>
    <span v-if="connection === 'reconnecting'" class="status__note">reconnecting</span>
    <span v-else-if="connection === 'polling'" class="status__note">polling</span>
    <span v-if="error" class="status__note status__note--error" :title="error">feed degraded</span>
  </div>
</template>

<style scoped>
.status {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem;
  font-size: 0.74rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.status__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--muted);
  flex: 0 0 auto;
}

.status[data-state="ok"] .status__dot {
  background: var(--good);
  animation: pulse 2.4s ease-in-out infinite;
}

.status[data-state="stale"] .status__dot {
  background: var(--warn);
}

.status[data-state="error"] .status__dot {
  background: var(--bad);
}

.status__sep {
  opacity: 0.5;
}

.status__note {
  padding: 0.05rem 0.35rem;
  border-radius: 4px;
  background: var(--surface-2);
}

.status__note--error {
  color: var(--bad);
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

@media (prefers-reduced-motion: reduce) {
  .status[data-state="ok"] .status__dot {
    animation: none;
  }
}
</style>
