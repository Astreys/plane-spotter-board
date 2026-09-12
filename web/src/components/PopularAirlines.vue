<script setup lang="ts">
import { computed } from "vue";
import type { InboundAircraft } from "../api";
import { tallyAirlines } from "../airlines";

const props = defineProps<{ aircraft: InboundAircraft[] }>();

const summary = computed(() => tallyAirlines(props.aircraft));
</script>

<!--
  Counted from the snapshot already on screen - no request, no upstream.

  The chips are initials rather than logos on purpose: airline marks are
  trademarks and we have no licensed source for them, so a coloured monogram is
  the honest stand-in.
-->
<template>
  <section class="card card--pad" aria-labelledby="airlines-card-title">
    <h2 id="airlines-card-title" class="card__heading">Airlines inbound</h2>

    <ul v-if="summary.airlines.length" class="airlines">
      <li v-for="airline in summary.airlines" :key="airline.name" class="airlines__item">
        <span class="airlines__chip" :style="{ '--chip-hue': airline.hue }" aria-hidden="true">
          {{ airline.initials }}
        </span>
        <span class="airlines__name">{{ airline.name }}</span>
        <span class="airlines__count">{{ airline.count }}</span>
      </li>
    </ul>

    <p v-else class="airlines__empty">
      No airline identified on the board yet.
    </p>

    <!--
      Routes resolve in the background after the poll, so early on most aircraft
      have no airline. Saying so beats a short list that looks like a quiet sky.
    -->
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

.airlines__chip {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 7px;
  background: hsl(var(--chip-hue) 62% 46% / 0.18);
  color: hsl(var(--chip-hue) 68% 62%);
  border: 1px solid hsl(var(--chip-hue) 62% 46% / 0.32);
  font-family: var(--mono);
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.02em;
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
