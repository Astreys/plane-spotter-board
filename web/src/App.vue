<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { fetchConfig, type ConfigDto } from "./api";
import { applyFilters, emptyStateText } from "./filter";
import { useBoard } from "./composables/useBoard";
import { useWeather } from "./composables/useWeather";
import AircraftRow from "./components/AircraftRow.vue";
import AirportCard from "./components/AirportCard.vue";
import AirportMasthead from "./components/AirportMasthead.vue";
import FilterChips from "./components/FilterChips.vue";
import NavRail from "./components/NavRail.vue";
import PopularAirlines from "./components/PopularAirlines.vue";
import StatusBar from "./components/StatusBar.vue";
import UpcomingList from "./components/UpcomingList.vue";
import WeatherCard from "./components/WeatherCard.vue";
import WeatherStrip from "./components/WeatherStrip.vue";

const config = ref<ConfigDto | null>(null);
const configError = ref<string | null>(null);
const icao = ref("");
const showPhotos = ref(readPhotoPreference());

/** Which board is on screen. Only ever "live" when there is no schedule key. */
const tab = ref<"live" | "upcoming">("live");

const board = useBoard(() => icao.value);

/**
 * One fetch loop feeds both the phone strip and the desktop card, so switching
 * airport asks once. It reads the server's cache; only the server talks to the
 * weather service.
 */
const weatherEnabled = computed(() => config.value?.weatherEnabled === true);
const weather = useWeather(
  () => icao.value,
  () => weatherEnabled.value,
);

const trackedAirports = computed(() =>
  (config.value?.airports ?? []).filter((airport) => airport.tracked),
);

/**
 * Read from /api/config rather than the snapshot, because config lands before the
 * first poll does - so the masthead names the airport and starts its clock on the
 * first paint instead of blinking through a placeholder.
 */
const airport = computed(
  () => config.value?.airports.find((entry) => entry.icao === icao.value) ?? null,
);

/**
 * Tabs appear only for an airport that actually has a schedule. Tracking an
 * airport live is cheap; giving it an Upcoming board costs metered units, so not
 * every airport in the dropdown has one.
 */
const showTabs = computed(() => airport.value?.hasSchedule === true);

// Switching to an airport without a schedule must not strand you on a dead tab.
watch(showTabs, (has) => {
  if (!has) tab.value = "live";
});

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
      (entry) =>
        entry.tracked &&
        (entry.icao === requested?.toUpperCase() || entry.iata === requested?.toUpperCase()),
    );
    icao.value = match?.icao ?? loaded.defaultAirport;
  } catch (error) {
    configError.value = (error as Error).message;
  }
});
</script>

<template>
  <div class="app">
    <AirportMasthead
      v-model="icao"
      :iata="airport?.iata ?? ''"
      :name="airport?.name ?? ''"
      :time-zone="airport?.timeZone ?? null"
      :hero-image="airport?.heroImage ?? null"
      :airports="trackedAirports"
    />

    <WeatherStrip v-if="weatherEnabled" :snapshot="weather.snapshot.value" />

    <div class="shell">
      <NavRail
        class="shell__nav"
        :tab="tab"
        :has-schedule="showTabs"
        :rules="config?.rules ?? null"
        @select="tab = $event"
      />

      <main class="shell__board panel">
        <div class="panel__controls">
          <div class="panel__head">
            <div class="panel__titles">
              <h2 class="panel__title">
                {{ tab === "live" ? "Inbound flights" : "Upcoming arrivals" }}
              </h2>
              <p class="panel__subtitle">
                <template v-if="airport">
                  Arriving at {{ airport.name }} ({{ airport.iata }})
                </template>
                <template v-else>Loading airport</template>
              </p>
            </div>

            <div class="panel__actions">
              <div v-if="showTabs" class="tabs" role="tablist">
                <button
                  type="button"
                  class="tabs__tab"
                  role="tab"
                  :aria-selected="tab === 'live'"
                  @click="tab = 'live'"
                >
                  Inbound now
                </button>
                <button
                  type="button"
                  class="tabs__tab"
                  role="tab"
                  :aria-selected="tab === 'upcoming'"
                  @click="tab = 'upcoming'"
                >
                  Upcoming big
                </button>
              </div>

              <button
                type="button"
                class="panel__photos"
                :aria-pressed="showPhotos"
                @click="togglePhotos"
              >
                {{ showPhotos ? "Photos on" : "Photos off" }}
              </button>
            </div>
          </div>

          <StatusBar
            v-if="tab === 'live'"
            :connection="board.connection.value"
            :age-seconds="board.ageSeconds.value"
            :stale="board.snapshot.value?.stale ?? false"
            :error="board.snapshot.value?.error ?? null"
            :tracked="board.aircraft.value.length"
            :shown="visible.length"
          />

          <FilterChips
            v-if="config && tab === 'live'"
            :groups="config.groups"
            :categories="config.categories"
            :selected="board.selected.value"
            :counts="board.snapshot.value?.counts ?? {}"
            @toggle="board.toggle"
            @clear="board.clear"
          />
        </div>

        <p v-if="configError" class="notice notice--error">
          Could not reach the board API: {{ configError }}
        </p>

        <UpcomingList
          v-else-if="tab === 'upcoming'"
          :icao="icao"
          :time-zone="airport?.timeZone ?? board.snapshot.value?.airport.timeZone ?? null"
        />

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

      <!--
        Cards are a desktop enhancement. On a phone the list is the product and
        every card pushes a row off the screen, so the rail simply is not there.
      -->
      <aside class="shell__rail">
        <WeatherCard
          v-if="weatherEnabled"
          :snapshot="weather.snapshot.value"
          :failed="weather.failed.value"
          :iata="airport?.iata ?? ''"
        />
        <!--
          website and heroImage are typed non-optional, but a browser holding a
          cached /api/config from before they existed will send neither, so the
          card gets an explicit null rather than undefined during a deploy.
        -->
        <AirportCard
          v-if="airport"
          :icao="airport.icao"
          :iata="airport.iata"
          :name="airport.name"
          :city="airport.city"
          :website="airport.website ?? null"
          :hero-image="airport.heroImage ?? null"
        />
        <PopularAirlines v-if="tab === 'live'" :aircraft="board.aircraft.value" />
      </aside>
    </div>

    <footer class="footer">
      <div class="footer__inner">
        <p>
          Arrival times are rough estimates from ground speed and distance, not a schedule.
        </p>
        <p v-if="config">
          <template v-for="(source, index) in config.sources" :key="source.url">
            <span v-if="index > 0"> · </span>
            <a :href="source.url" target="_blank" rel="noopener">{{ source.label }}</a>
          </template>
        </p>
        <p v-else-if="board.snapshot.value">
          <a :href="board.snapshot.value.source.attribution.url" target="_blank" rel="noopener">
            {{ board.snapshot.value.source.attribution.label }}
          </a>
        </p>
        <!--
          This is an independent spotting board, not an airport's own site. The
          disclaimer is what says so, so it stays visible at every width.
        -->
        <p class="footer__note">
          An independent plane-spotting board, not affiliated with any airport or airline.
          Non-commercial use. Not for navigation.
        </p>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}

/*
 * The grid itself. One column on a phone, plus the card rail at 65rem and the nav
 * rail at 80rem. The widths come from --shell-max in main.css so the masthead and
 * footer line up with the board without repeating the ladder.
 */
.shell {
  flex: 1 1 auto;
  width: 100%;
  max-width: var(--shell-max);
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--shell-gap);
  align-items: start;
}

.shell__nav,
.shell__rail {
  display: none;
}

.shell__board {
  min-width: 0;
}

/*
 * Sticky on a phone, where the masthead scrolls away and these are the only
 * controls left. On desktop there is room to keep everything in view, and a
 * sticky block inside a rounded panel fights the panel's overflow clipping.
 */
.panel__controls {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.7rem var(--shell-gutter) 0.75rem;
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--line);
}

.panel__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem 0.7rem;
}

.panel__titles {
  flex: 1 1 10rem;
  min-width: 0;
}

.panel__title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.2;
}

.panel__subtitle {
  margin: 0;
  font-size: 0.74rem;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel__actions {
  flex: 1 1 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.panel__photos {
  flex: 0 0 auto;
  min-height: 2rem;
  padding: 0 0.65rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--muted);
  font: inherit;
  font-size: 0.72rem;
  cursor: pointer;
}

.panel__photos[aria-pressed="true"] {
  color: var(--text);
}

/* Two boards, one panel. The tab strip is the only thing that switches them. */
.tabs {
  flex: 1 1 auto;
  display: flex;
  gap: 0.25rem;
  padding: 0.15rem;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 999px;
}

.tabs__tab {
  flex: 1 1 0;
  min-height: 1.95rem;
  border: 0;
  border-radius: 999px;
  background: none;
  color: var(--muted);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 550;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}

.tabs__tab[aria-selected="true"] {
  background: var(--accent);
  color: var(--accent-ink);
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
  border-top: 1px solid var(--line);
}

.footer__inner {
  width: 100%;
  max-width: var(--shell-max);
  margin: 0 auto;
  padding: 1.2rem var(--shell-gutter);
  padding-bottom: max(1.2rem, env(safe-area-inset-bottom));
  font-size: 0.7rem;
  line-height: 1.6;
  color: var(--muted);
}

.footer__inner p {
  margin: 0;
}

.footer__inner a {
  color: var(--muted);
}

.footer__note {
  margin-top: 0.35rem;
  color: var(--muted-2);
}

@media (min-width: 47.5rem) {
  .panel__actions {
    flex: 0 0 auto;
  }

  .tabs {
    flex: 0 0 auto;
    min-width: 16rem;
  }
}

/* The card rail arrives, and the board becomes a card rather than a full-bleed list. */
@media (min-width: 65rem) {
  .shell {
    grid-template-columns: minmax(0, 1fr) 19rem;
    padding: var(--shell-gap) var(--shell-gutter);
  }

  .shell__rail {
    display: flex;
    flex-direction: column;
    gap: var(--shell-gap);
    position: sticky;
    top: var(--shell-gap);
  }

  .shell__board {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 14px;
    overflow: hidden;
  }

  .panel__controls {
    position: static;
    background: none;
    backdrop-filter: none;
  }
}

/* The nav rail arrives and takes over from the tab strip, which would duplicate it. */
@media (min-width: 80rem) {
  .shell {
    grid-template-columns: 11.5rem minmax(0, 1fr) 20rem;
  }

  /*
   * Sticky on the grid item, not on the box inside it. The item is content-height
   * under `align-items: start`, so a sticky child would have nowhere to travel -
   * the grid *area* is what runs the full height of the board beside it.
   */
  .shell__nav {
    display: block;
    position: sticky;
    top: var(--shell-gap);
  }

  .tabs {
    display: none;
  }
}
</style>
