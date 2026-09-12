import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App.vue";
import type { ConfigDto, InboundSnapshot, WeatherSnapshot } from "../src/api";

/**
 * A render smoke test against stubbed data: does the board actually paint rows,
 * chips, the age indicator, the empty state and the attribution? Cheap to run and
 * it catches the template mistakes a typecheck cannot.
 */

const config: ConfigDto = {
  upcomingEnabled: false,
  weatherEnabled: true,
  upcomingCategories: ["DOUBLE_DECK", "QUAD", "WIDEBODY"],
  sources: [
    { label: "ADS-B data by adsb.lol", url: "https://adsb.lol" },
    { label: "Routes by adsbdb.com", url: "https://www.adsbdb.com" },
    { label: "Photos by planespotters.net", url: "https://www.planespotters.net" },
  ],
  airports: [
    {
      icao: "CYYZ",
      iata: "YYZ",
      name: "Toronto Pearson International",
      city: "Toronto",
      timeZone: "America/Toronto",
      website: "https://www.torontopearson.com",
      heroImage: null,
      tracked: true,
      hasSchedule: false,
    },
  ],
  defaultAirport: "CYYZ",
  groups: [
    { id: "airframe", label: "Airframe" },
    { id: "role", label: "Role" },
    { id: "interest", label: "Interest" },
  ],
  categories: [
    { id: "WIDEBODY", group: "airframe", label: "Widebody", blurb: "widebody", fallback: false },
    { id: "OTHER", group: "airframe", label: "Other", blurb: "unclassified", fallback: true },
    { id: "FREIGHTER", group: "role", label: "Freighter", blurb: "freight", fallback: false },
    { id: "RARE", group: "interest", label: "Rare", blurb: "rare", fallback: false },
  ],
  rules: {
    maxAltitudeFt: 13000,
    maxDistanceNm: 50,
    descentRateFpm: -200,
    lowAltitudeFt: 6000,
    maxTrackOffsetDeg: 60,
    maxPositionAgeSec: 60,
  },
  attribution: { label: "ADS-B data by adsb.lol", url: "https://adsb.lol", note: "Non-commercial." },
  pollIntervalMs: 15000,
};

const snapshot: InboundSnapshot = {
  airport: {
    icao: "CYYZ",
    iata: "YYZ",
    name: "Toronto Pearson International",
    city: "Toronto",
    lat: 43.6777,
    lon: -79.6248,
    timeZone: "America/Toronto",
  },
  updatedAt: Date.now(),
  ageSeconds: 2,
  stale: false,
  error: null,
  source: { host: "https://api.adsb.lol", attribution: config.attribution },
  totalTracked: 42,
  counts: { WIDEBODY: 1, OTHER: 1, FREIGHTER: 0, RARE: 1 },
  aircraft: [
    {
      hex: "4bb279",
      callsign: "UAE203",
      registration: "A6-EUV",
      type: "A388",
      typeName: "Airbus A380-800",
      altitudeFt: 4200,
      groundSpeedKt: 220,
      verticalRateFpm: -1088,
      trackDeg: 62,
      lat: 43.36,
      lon: -80.02,
      distanceNm: 18.4,
      bearingFromAirportDeg: 235,
      fromDirection: "SW",
      minutesOut: 6,
      categories: ["WIDEBODY", "RARE"],
      route: {
        origin: { iata: "DXB", icao: "OMDB", name: "Dubai International", city: "Dubai", countryIso: "AE" },
        destination: {
          iata: "YYZ",
          icao: "CYYZ",
          name: "Lester B. Pearson International",
          city: "Toronto",
          countryIso: "CA",
        },
        airline: "Emirates",
        callsignIata: "EK203",
        arrivesHere: true,
      },
      seenPosSec: 0.4,
    },
    {
      hex: "c060bc",
      callsign: "JZA736",
      registration: "C-GKQL",
      type: "E75L",
      typeName: null,
      altitudeFt: 6175,
      groundSpeedKt: 240,
      verticalRateFpm: -900,
      trackDeg: 60,
      lat: 43.4,
      lon: -79.95,
      distanceNm: 22.5,
      bearingFromAirportDeg: 245,
      fromDirection: "WSW",
      minutesOut: 8,
      categories: ["OTHER"],
      // The route database returned a city pair that does not end here.
      route: {
        origin: { iata: "JFK", icao: "KJFK", name: null, city: "New York", countryIso: "US" },
        destination: { iata: "CLT", icao: "KCLT", name: null, city: "Charlotte", countryIso: "US" },
        airline: "Endeavor Air",
        callsignIata: null,
        arrivesHere: false,
      },
      seenPosSec: 1.1,
    },
  ],
};

/** Stand-in for EventSource, which happy-dom does not provide. */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static readonly CLOSED = 2;
  readyState = 1;
  private listeners = new Map<string, Array<(event: unknown) => void>>();

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: (event: unknown) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  emit(type: string, data?: unknown): void {
    for (const handler of this.listeners.get(type) ?? []) {
      handler({ data: JSON.stringify(data) });
    }
  }

  close(): void {
    this.readyState = FakeEventSource.CLOSED;
  }
}

/** A fresh report, shaped like /api/airport/:icao/weather. Tests swap it before mounting. */
function freshWeather(): WeatherSnapshot {
  return {
    airport: { icao: "CYYZ", iata: "YYZ" },
    observation: {
      observedAt: new Date(Date.now() - 19 * 60_000).toISOString(),
      temperatureC: 16,
      dewpointC: 10,
      humidityPct: 68,
      wind: { directionDeg: 300, fromCompass: "WNW", speedKt: 6, gustKt: null, variable: false, calm: false },
      visibilityKm: 24.1,
      visibilityOrMore: false,
      cloudBase: { cover: "BKN", baseFt: 1400 },
      condition: "Mostly cloudy",
      icon: "mostly-cloudy",
      isDay: true,
      raw: "METAR CYYZ 111300Z 30006KT 15SM BKN014 16/10 A3005",
    },
    ageSeconds: 19 * 60,
    stale: false,
    loading: false,
    unavailable: false,
    error: null,
  };
}

let weather: WeatherSnapshot = freshWeather();

function stubFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      if (String(input).includes("/api/config")) {
        return new Response(JSON.stringify(config), {
          headers: { "content-type": "application/json" },
        });
      }
      if (String(input).includes("/weather")) {
        return new Response(JSON.stringify(weather), {
          headers: { "content-type": "application/json" },
        });
      }
      // Photos: always a miss, so rows render without one.
      return new Response(JSON.stringify({ hex: "x", photo: null }), {
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

async function mountBoard() {
  const wrapper = mount(App);
  await flushPromises();
  const source = FakeEventSource.instances.at(-1)!;
  source.emit("open");
  source.emit("snapshot", snapshot);
  await flushPromises();
  return { wrapper, source };
}

beforeEach(() => {
  FakeEventSource.instances = [];
  weather = freshWeather();
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("IntersectionObserver", undefined);
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  config.weatherEnabled = true;
});

describe("the board", () => {
  it("subscribes to the stream for the configured airport", async () => {
    const { source } = await mountBoard();
    expect(source.url).toContain("/api/airport/CYYZ/stream");
  });

  it("renders one row per inbound aircraft", async () => {
    const { wrapper } = await mountBoard();
    const rows = wrapper.findAll("li.row");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.text()).toContain("A388");
    expect(rows[0]!.text()).toContain("UAE203");
    expect(rows[0]!.text()).toContain("A6-EUV");
    expect(rows[0]!.text()).toContain("4,200 ft");
    expect(rows[0]!.text()).toContain("18.4 nm SW");
  });

  it("leads each row with the estimated minutes out", async () => {
    const { wrapper } = await mountBoard();
    const eta = wrapper.findAll("li.row")[0]!.find(".row__eta-value");
    expect(eta.text()).toBe("6");
  });

  it("badges a rare aircraft so it stands out", async () => {
    const { wrapper } = await mountBoard();
    const rows = wrapper.findAll("li.row");
    expect(rows[0]!.classes()).toContain("row--rare");
    expect(rows[0]!.text()).toContain("rare");
    expect(rows[1]!.classes()).not.toContain("row--rare");
  });

  it("leads with the aircraft name and demotes the ICAO code", async () => {
    const { wrapper } = await mountBoard();
    const row = wrapper.findAll("li.row")[0]!;
    expect(row.find(".row__name").text()).toBe("Airbus A380-800");
    expect(row.find(".row__name").classes()).not.toContain("row__name--code");
    // The code is still there, just no longer the headline.
    expect(row.find(".row__code").text()).toBe("A388");
  });

  it("falls back to the raw type code for an aircraft we cannot name", async () => {
    const { wrapper } = await mountBoard();
    const row = wrapper.findAll("li.row")[1]!;
    expect(row.find(".row__name").text()).toBe("E75L");
    expect(row.find(".row__name").classes()).toContain("row__name--code");
    // Nothing to demote — the code is already the headline, so it is not repeated.
    expect(row.find(".row__code").exists()).toBe(false);
  });

  it("shows a chip per category with its count", async () => {
    const { wrapper } = await mountBoard();
    const chips = wrapper.findAll("button.chip");
    expect(chips).toHaveLength(4);
    const widebody = chips.find((chip) => chip.text().includes("Widebody"))!;
    expect(widebody.text()).toContain("1");
  });

  it("filters the list when a chip is tapped, without a round trip", async () => {
    const { wrapper } = await mountBoard();
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    const rare = wrapper.findAll("button.chip").find((chip) => chip.text().includes("Rare"))!;
    await rare.trigger("click");

    expect(wrapper.findAll("li.row")).toHaveLength(1);
    expect(wrapper.findAll("li.row")[0]!.text()).toContain("UAE203");
    expect(rare.attributes("aria-pressed")).toBe("true");
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);
  });

  it("explains an empty result in terms of what was filtered for", async () => {
    const { wrapper } = await mountBoard();
    const freighter = wrapper
      .findAll("button.chip")
      .find((chip) => chip.text().includes("Freighter"))!;
    await freighter.trigger("click");

    expect(wrapper.findAll("li.row")).toHaveLength(0);
    expect(wrapper.text()).toContain("Nothing freight inbound right now");
    expect(wrapper.text()).toContain("Watching 42 aircraft within 50 nm");
  });

  it("reports how fresh the data is", async () => {
    const { wrapper } = await mountBoard();
    expect(wrapper.find(".status").text()).toMatch(/updated (just now|\d+s ago)/);
    expect(wrapper.find(".status").text()).toContain("2 of 2 inbound");
    expect(wrapper.find(".status").attributes("data-state")).toBe("ok");
  });

  it("flags a degraded feed instead of hiding it", async () => {
    const { wrapper } = await mountBoard();
    const source = FakeEventSource.instances.at(-1)!;
    source.emit("snapshot", { ...snapshot, stale: true, error: "all hosts failed" });
    await flushPromises();

    expect(wrapper.find(".status").attributes("data-state")).toBe("error");
    expect(wrapper.text()).toContain("feed degraded");
    // The last good board is still on screen.
    expect(wrapper.findAll("li.row")).toHaveLength(2);
  });

  it("credits every data source", async () => {
    const { wrapper } = await mountBoard();
    expect(wrapper.text()).toContain("ADS-B data by adsb.lol");
    expect(wrapper.text()).toContain("Routes by adsbdb.com");
    expect(wrapper.text()).toContain("planespotters.net");
    expect(wrapper.text()).toContain("estimates");
  });

  it("shows where an arrival is coming from and going to", async () => {
    const { wrapper } = await mountBoard();
    const route = wrapper.findAll("li.row")[0]!.find(".row__route");

    expect(route.exists()).toBe(true);
    expect(route.text()).toContain("DXB");
    expect(route.text()).toContain("YYZ");
    // The origin city is the part worth reading; the codes alone are terse.
    expect(route.text()).toContain("Dubai");
    expect(route.classes()).not.toContain("row__route--elsewhere");
    expect(route.text()).not.toContain("scheduled");
  });

  it("flags a scheduled route that does not end at this airport", async () => {
    const { wrapper } = await mountBoard();
    const route = wrapper.findAll("li.row")[1]!.find(".row__route");

    // Still shown - hiding it would lose real information - but marked.
    expect(route.text()).toContain("JFK");
    expect(route.text()).toContain("CLT");
    expect(route.classes()).toContain("row__route--elsewhere");
    expect(route.text()).toContain("scheduled");
    expect(route.attributes("title")).toContain("does not end at this airport");
  });

  it("renders no route line for an aircraft with no route", async () => {
    const { wrapper, source } = await mountBoard();
    source.emit("snapshot", {
      ...snapshot,
      aircraft: [{ ...snapshot.aircraft[0]!, route: null }],
    });
    await flushPromises();

    expect(wrapper.findAll("li.row")).toHaveLength(1);
    expect(wrapper.find(".row__route").exists()).toBe(false);
  });
});

describe("the weather", () => {
  it("shows the card with wind direction, humidity, visibility and cloud base", async () => {
    const { wrapper } = await mountBoard();
    const card = wrapper.find(".weather");

    expect(card.text()).toContain("16°C");
    expect(card.text()).toContain("Mostly cloudy");
    expect(card.text()).toContain("WNW 6 kt");
    expect(card.text()).toContain("68%");
    expect(card.text()).toContain("24 km");
    expect(card.text()).toContain("Broken 1,400 ft");
  });

  it("says where and how long ago the report was observed", async () => {
    const { wrapper } = await mountBoard();
    expect(wrapper.find(".weather__observed").text()).toContain("Observed at YYZ · 19 min ago");
  });

  it("puts the three fence-side numbers in the phone strip", async () => {
    const { wrapper } = await mountBoard();
    const strip = wrapper.find(".wx-strip");

    expect(strip.text()).toContain("16°C");
    expect(strip.text()).toContain("WNW 6 kt");
    expect(strip.text()).toContain("24 km");
  });

  it("flags an overdue report instead of passing it off as fresh", async () => {
    weather = { ...freshWeather(), ageSeconds: 2 * 3600, stale: true };
    const { wrapper } = await mountBoard();

    expect(wrapper.find(".weather__warning").text()).toContain("A newer report is overdue");
    expect(wrapper.find(".wx-strip").text()).toContain("2 h ago");
  });

  it("shows no weather, rather than old weather, once the report has expired", async () => {
    weather = {
      ...freshWeather(),
      observation: null,
      ageSeconds: 4 * 3600,
      stale: true,
      unavailable: true,
      error: "latest report is too old to show",
    };
    const { wrapper } = await mountBoard();

    expect(wrapper.find(".weather").text()).toContain("No current weather report");
    expect(wrapper.find(".weather").text()).toContain("YYZ last reported 4 h ago");
    expect(wrapper.text()).not.toContain("16°C");
    // On a phone, no report is not worth a line above the list.
    expect(wrapper.find(".wx-strip").exists()).toBe(false);
  });

  it("asks for nothing and shows nothing when the server has no weather", async () => {
    config.weatherEnabled = false;
    const { wrapper } = await mountBoard();

    const urls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes("/weather"))).toBe(false);
    expect(wrapper.find(".weather").exists()).toBe(false);
    expect(wrapper.find(".wx-strip").exists()).toBe(false);
  });
});
