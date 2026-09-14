<script setup lang="ts">
import { computed } from "vue";
import type { InboundAircraft } from "../api";
import { tallyAirlines } from "../airlines";
import AirlineMark from "./AirlineMark.vue";

const props = defineProps<{ aircraft: InboundAircraft[] }>();

const summary = computed(() => tallyAirlines(props.aircraft));
</script>

<!--
  Counted from the snapshot already on screen - no request, no upstream.

  An airline reaches a row from either the route lookup or the airframe's
  registered operator, so most aircraft are named within a tick or two of
  appearing. Whatever is still unnamed is said plainly rather than left out.
-->
<template>
  <section class="card card--pad" aria-labelledby="airlines-card-title">
    <h2 id="airlines-card-title" class="card__heading">Airlines inbound</h2>

    <ul v-if="summary.airlines.length" class="airlines">
      <li v-for="airline in summary.airlines" :key="airline.code ?? airline.name" class="airlines__item">
        <AirlineMark
          :style="{ '--mark-hue': airline.hue }"
          :name="airline.name"
          :code="airline.code"
          :size="26"
        />
        <span class="airlines__name">{{ airline.name }}</span>
        <span class="airlines__count">{{ airline.count }}</span>
      </li>
    </ul>

    <p v-else class="airlines__empty">No airline identified on the board yet.</p>

    <p v-if="summary.unidentified" class="airlines__note">
      {{ summary.unidentified }} more not yet identified
    </p>
  </section>
</template>

<style scoped>
.airlines {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.airlines__item {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.3rem 0;
  font-size: 0.8rem;
}

.airlines__name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.airlines__count {
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
  font-size: 0.78rem;
  color: var(--muted);
}

.airlines__empty,
.airlines__note {
  margin: 0.45rem 0 0;
  font-size: 0.72rem;
  color: var(--muted-2);
}

.airlines__empty {
  margin-top: 0.2rem;
}
</style>
