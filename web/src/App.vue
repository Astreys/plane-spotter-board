<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { fetchConfig, type ConfigDto } from "./api";
import { applyFilters, emptyStateText } from "./filter";
import { useBoard } from "./composables/useBoard";
import AircraftRow from "./components/AircraftRow.vue";
import FilterChips from "./components/FilterChips.vue";
import StatusBar from "./components/StatusBar.vue";

const config = ref<ConfigDto | null>(null);
const configError = ref<string | null>(null);
const icao = ref("");
const showPhotos = ref(readPhotoPreference());

const board = useBoard(() => icao.value);

const trackedAirports = computed(() =>
  (config.value?.airports ?? []).filter((airport) => airport.tracked),
);

const visible = computed(() =>
  applyFilters(board.aircraft.value, board.selected.value, config.value?.categories ?? []),
);

const emptyText = computed(() =>
  emptyStateText(board.selected.value, config.value?.categories ?? []),
);

function readPhotoPreference(): boolean {
  try {
    return localStorage.getItem("psb:photos") !== "off";
  } catch {
    return true;
  }
}

function togglePhotos(): void {
  showPhotos.value = !showPhotos.value;
  try {
    localStorage.setItem("psb:photos", showPhotos.value ? "on" : "off");
  } catch {
    // Private browsing; the preference just will not survive a reload.
  }
}

onMounted(async () => {
  try {
    const loaded = await fetchConfig();
    config.value = loaded;
    // Prefer whatever the URL asked for, so a bookmark to ?airport=CYVR works.
    const requested = new URLSearchParams(location.search).get("airport");
    const match = loaded.airports.find(
      (airport) =>
        airport.tracked &&
        (airport.icao === requested?.toUpperCase() || airport.iata === requested?.toUpperCase()),
    );
    icao.value = match?.icao ?? loaded.defaultAirport;
  } catch (error) {
    configError.value = (error as Error).message;
  }
});
</script>

<template>
  <div class="app">
    <header class="header">
      <div class="header__title">
        <select
          v-if="trackedAirports.length > 1"
          v-model="icao"
          class="header__airport"
          aria-label="Airport"
        >
          <option v-for="airport in trackedAirports" :key="airport.icao" :value="airport.icao">
            {{ airport.iata }}
          </option>
        </select>
        <span v-else class="header__airport header__airport--static">
          {{ board.snapshot.value?.airport.iata ?? "..." }}
        </span>

        <div class="header__sub">
          <h1>Inbound</h1>
          <p>{{ board.snapshot.value?.airport.name ?? "Loading airport" }}</p>
        </div>

        <button
          type="button"
          class="header__photos"
          :aria-pressed="showPhotos"
          @click="togglePhotos"
        >
          {{ showPhotos ? "Photos on" : "Photos off" }}
        </button>
      </div>

      <StatusBar
        :connection="board.connection.value"
        :age-seconds="board.ageSeconds.value"
        :stale="board.snapshot.value?.stale ?? false"
        :error="board.snapshot.value?.error ?? null"
        :tracked="board.aircraft.value.length"
        :shown="visible.length"
      />

      <FilterChips
        v-if="config"
        :groups="config.groups"
        :categories="config.categories"
        :selected="board.selected.value"
        :counts="board.snapshot.value?.counts ?? {}"
        @toggle="board.toggle"
        @clear="board.clear"
      />
    </header>

    <main class="board">
      <p v-if="configError" class="notice notice--error">
        Could not reach the board API: {{ configError }}
      </p>

      <ul v-else-if="visible.length" class="list">
        <AircraftRow
          v-for="aircraft in visible"
          :key="aircraft.hex"
          :aircraft="aircraft"
          :show-photos="showPhotos"
        />
      </ul>

      <div v-else class="empty">
        <p class="empty__headline">{{ emptyText }}</p>
        <p class="empty__detail">
          Watching {{ board.snapshot.value?.totalTracked ?? 0 }} aircraft within
          {{ config?.rules.maxDistanceNm ?? 50 }} nm.
          <template v-if="board.selected.value.length">
            <button type="button" class="empty__clear" @click="board.clear">
              Clear the filters
            </button>
            to see everything on approach.
          </template>
        </p>
      </div>
    </main>

    <footer class="footer">
      <p>
        Arrival times are rough estimates from ground speed and distance, not a schedule.
      </p>
      <p v-if="board.snapshot.value">
        <a :href="board.snapshot.value.source.attribution.url" target="_blank" rel="noopener">
          {{ board.snapshot.value.source.attribution.label }}
        </a>
        · photos by
        <a href="https://www.planespotters.net" target="_blank" rel="noopener">planespotters.net</a>
      </p>
      <p class="footer__note">Non-commercial use. Not for navigation.</p>
    </footer>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}

.header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.7rem 0.9rem 0.75rem;
  padding-top: max(0.7rem, env(safe-area-inset-top));
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--line);
}

.header__title {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.header__airport {
  font-family: var(--mono);
  font-size: 1.45rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0.15rem 0.4rem;
}

.header__airport--static {
  border-color: transparent;
  background: none;
  padding-left: 0;
}

.header__sub {
  min-width: 0;
  flex: 1 1 auto;
}

.header__sub h1 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.1;
}

.header__sub p {
  margin: 0;
  font-size: 0.72rem;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header__photos {
  flex: 0 0 auto;
  min-height: 2rem;
  padding: 0 0.6rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--muted);
  font: inherit;
  font-size: 0.72rem;
  cursor: pointer;
}

.header__photos[aria-pressed="true"] {
  color: var(--text);
}

.board {
  flex: 1 1 auto;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.empty {
  padding: 3rem 1.2rem;
  text-align: center;
}

.empty__headline {
  margin: 0 0 0.5rem;
  font-size: 1.05rem;
  font-weight: 600;
}

.empty__detail {
  margin: 0;
  font-size: 0.82rem;
  color: var(--muted);
  line-height: 1.5;
}

.empty__clear {
  padding: 0;
  border: 0;
  background: none;
  color: var(--accent);
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}

.notice {
  margin: 1.5rem 0.9rem;
  padding: 0.8rem;
  border-radius: 8px;
  font-size: 0.85rem;
}

.notice--error {
  background: color-mix(in srgb, var(--bad) 14%, transparent);
  color: var(--bad);
}

.footer {
  padding: 1.2rem 0.9rem;
  padding-bottom: max(1.2rem, env(safe-area-inset-bottom));
  border-top: 1px solid var(--line);
  font-size: 0.7rem;
  line-height: 1.6;
  color: var(--muted);
}

.footer p {
  margin: 0;
}

.footer a {
  color: var(--muted);
}

.footer__note {
  margin-top: 0.35rem;
  color: var(--muted-2);
}
</style>
