<script setup lang="ts">
import AirportHero from "./AirportHero.vue";

defineProps<{
  icao: string;
  iata: string;
  name: string;
  city: string;
  /** The airport's own site. Null for any airport nobody has filled in yet. */
  website: string | null;
  heroImage: string | null;
}>();
</script>

<!--
  One outbound link, not the four the mockup drew. Terminal maps, parking and
  ground transport are the airport's own pages; reproducing them here would mean
  maintaining five airports' worth of facts we have no feed for, and presenting
  them as ours is the same problem as the branding we left off the footer.
-->
<template>
  <section class="card" aria-labelledby="airport-card-title">
    <div class="card__media">
      <AirportHero variant="card" :seed="icao" :image="heroImage" />
    </div>

    <div class="card__body">
      <h2 id="airport-card-title" class="card__title">{{ name }}</h2>
      <p class="card__codes">
        <span class="card__code">{{ iata }}</span>
        <span class="card__dot" aria-hidden="true">·</span>
        <span class="card__code">{{ icao }}</span>
        <span class="card__city">{{ city }}</span>
      </p>

      <a v-if="website" class="card__link" :href="website" target="_blank" rel="noopener">
        Airport website
        <svg class="card__link-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"
          />
        </svg>
      </a>
    </div>
  </section>
</template>

<style scoped>
.card {
  padding: 0;
  overflow: hidden;
}

.card__media {
  position: relative;
  height: 6.5rem;
}

.card__body {
  padding: 0.8rem 0.9rem 0.9rem;
}

.card__title {
  margin: 0 0 0.25rem;
  font-size: 0.92rem;
  font-weight: 600;
  line-height: 1.25;
}

.card__codes {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin: 0;
  font-size: 0.74rem;
  color: var(--muted);
}

.card__code {
  font-family: var(--mono);
  letter-spacing: 0.03em;
}

.card__dot {
  opacity: 0.5;
}

.card__city {
  margin-left: 0.15rem;
  color: var(--muted-2);
}

.card__link {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.7rem;
  font-size: 0.78rem;
  font-weight: 500;
  text-decoration: none;
}

.card__link:hover {
  text-decoration: underline;
}

.card__link-icon {
  width: 0.85rem;
  height: 0.85rem;
}
</style>
