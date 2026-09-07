import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App.vue";
import type { ConfigDto, UpcomingSnapshot } from "../src/api";

/**
 * The Upcoming tab: it only exists when the server says a schedule is configured,
 * and it must never appear half-built when it is not.
 */

const baseConfig: ConfigDto = {
  upcomingEnabled: true,
  upcomingCategories: ["DOUBLE_DECK", "QUAD", "WIDEBODY"],
  sources: [],
  airports: [
    { icao: "CYYZ", iata: "YYZ", name: "Toronto Pearson", city: "Toronto", tracked: true },
  ],
  defaultAirport: "CYYZ",
  groups: [{ id: "airframe", label: "Airframe" }],
  categories: [
    { id: "WIDEBODY", group: "airframe", label: "Widebody", blurb: "widebody", fallback: false },
    { id: "OTHER", group: "airframe", label: "Other", blurb: "unclassified", fallback: true },
  ],
  rules: {
    maxAltitudeFt: 13000,
    maxDistanceNm: 50,
    descentRateFpm: -200,
    lowAltitudeFt: 6000,
    maxTrackOffsetDeg: 60,
    maxPositionAgeSec: 60,
  },
  attribution: { label: "ADS-B data by adsb.lol", url: "https://adsb.lol", note: "" },
  pollIntervalMs: 15000,
};

const upcoming: UpcomingSnapshot = {
  airport: { icao: "CYYZ", iata: "YYZ", name: "Toronto Pearson", timeZone: "America/Toronto" },
  updatedAt: Date.now(),
  ageSeconds: 30,
  stale: false,
  unavailable: false,
  error: null,
  windowHours: 12,
  totalScheduled: 409,
  unrecognisedModels: [],
  unitsRemaining: 596,
  flights: [
    {
      number: "CX 828",
      callsign: "CPA828",
      airline: "Cathay Pacific",
      status: "Expected",
      isCargo: false,
      type: "A35K",
      model: "Airbus A350-1000",
      typeName: "Airbus A350-1000",
      registration: "B-LXA",
      hex: "780abc",
      origin: { icao: "VHHH", iata: "HKG", name: "Hong Kong" },
      arrivalTime: new Date(Date.now() + 40 * 60000).toISOString(),
      arrivalIsRevised: false,
      terminal: "1",
      gate: "D40",
      categories: ["WIDEBODY"],
    },
    {
      number: "LH 470",
      callsign: "DLH470",
      airline: "Lufthansa",
      status: "Delayed",
      isCargo: false,
      type: "B748",
      model: "Boeing 747-8",
      typeName: "Boeing 747-8",
      registration: "D-ABYA",
      hex: "3c4dc2",
      origin: { icao: "EDDF", iata: "FRA", name: "Frankfurt" },
      arrivalTime: new Date(Date.now() + 200 * 60000).toISOString(),
      arrivalIsRevised: true,
      terminal: "1",
      gate: null,
      categories: ["DOUBLE_DECK", "QUAD", "WIDEBODY", "RARE"],
    },
  ],
};

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
    for (const handler of this.listeners.get(type) ?? []) handler({ data: JSON.stringify(data) });
  }
  close(): void {
    this.readyState = FakeEventSource.CLOSED;
  }
}

function stubFetch(config: ConfigDto, snapshot: UpcomingSnapshot | null) {
  return vi.fn(async (input: string) => {
    const url = String(input);
    if (url.includes("/api/config")) {
      return new Response(JSON.stringify(config), {
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/upcoming")) {
      if (!snapshot) return new Response("nope", { status: 500 });
      return new Response(JSON.stringify(snapshot), {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ hex: "x", photo: null }), {
      headers: { "content-type": "application/json" },
    });
  });
}

async function mountApp(config: ConfigDto, snapshot: UpcomingSnapshot | null = upcoming) {
  vi.stubGlobal("fetch", stubFetch(config, snapshot));
  const wrapper = mount(App);
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("IntersectionObserver", undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the Upcoming tab", () => {
  it("is hidden entirely when the server has no schedule configured", async () => {
    const wrapper = await mountApp({ ...baseConfig, upcomingEnabled: false });
    expect(wrapper.findAll("button.tabs__tab")).toHaveLength(0);
  });

  it("appears when the server says a schedule is configured", async () => {
    const wrapper = await mountApp(baseConfig);
    const tabs = wrapper.findAll("button.tabs__tab");
    expect(tabs).toHaveLength(2);
    expect(tabs[0]!.text()).toContain("Inbound now");
    expect(tabs[1]!.text()).toContain("Upcoming big");
    // The live board is what you land on.
    expect(tabs[0]!.attributes("aria-selected")).toBe("true");
  });

  it("shows scheduled big aircraft after switching", async () => {
    const wrapper = await mountApp(baseConfig);
    await wrapper.findAll("button.tabs__tab")[1]!.trigger("click");
    await flushPromises();

    const flights = wrapper.findAll("li.flight");
    expect(flights).toHaveLength(2);
    expect(flights[0]!.text()).toContain("Airbus A350-1000");
    expect(flights[0]!.text()).toContain("CX 828");
    expect(flights[0]!.text()).toContain("HKG");
    expect(flights[0]!.text()).toContain("Cathay Pacific");
  });

  it("badges a rare double decker", async () => {
    const wrapper = await mountApp(baseConfig);
    await wrapper.findAll("button.tabs__tab")[1]!.trigger("click");
    await flushPromises();

    const second = wrapper.findAll("li.flight")[1]!;
    expect(second.text()).toContain("Boeing 747-8");
    expect(second.text()).toContain("double deck");
    expect(second.text()).toContain("rare");
  });

  it("marks a revised time so it is not read as the schedule", async () => {
    const wrapper = await mountApp(baseConfig);
    await wrapper.findAll("button.tabs__tab")[1]!.trigger("click");
    await flushPromises();

    expect(wrapper.findAll("li.flight")[1]!.text()).toContain("revised");
    expect(wrapper.findAll("li.flight")[0]!.text()).not.toContain("revised");
  });

  it("says how much of the schedule it filtered out", async () => {
    const wrapper = await mountApp(baseConfig);
    await wrapper.findAll("button.tabs__tab")[1]!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("2 of 409 scheduled arrivals");
    expect(wrapper.text()).toContain("not observed");
  });

  it("hides the live filter chips while the schedule is showing", async () => {
    const wrapper = await mountApp(baseConfig);
    expect(wrapper.findAll("button.chip").length).toBeGreaterThan(0);

    await wrapper.findAll("button.tabs__tab")[1]!.trigger("click");
    await flushPromises();
    expect(wrapper.findAll("button.chip")).toHaveLength(0);
  });

  it("says the schedule is out of date rather than claiming nothing is due", async () => {
    // The reported bug: a day-old cache emptied itself and read as "nothing big due"
    // while widebodies were actually landing.
    const wrapper = await mountApp(baseConfig, {
      ...upcoming,
      unavailable: true,
      stale: true,
      ageSeconds: 31 * 3600,
      updatedAt: Date.now() - 31 * 3600 * 1000,
      error: "fetch failed",
      flights: [],
    });
    await wrapper.findAll("button.tabs__tab")[1]!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Schedule out of date");
    expect(wrapper.text()).toContain("31 hours ago");
    expect(wrapper.text()).toContain("fetch failed");
    expect(wrapper.text()).not.toContain("Nothing big due");
  });

  it("warns above the list when serving an ageing but usable schedule", async () => {
    const wrapper = await mountApp(baseConfig, {
      ...upcoming,
      stale: true,
      ageSeconds: 5 * 3600,
    });
    await wrapper.findAll("button.tabs__tab")[1]!.trigger("click");
    await flushPromises();

    // The flights are still shown, but never silently.
    expect(wrapper.findAll("li.flight")).toHaveLength(2);
    expect(wrapper.find(".upcoming__warn--banner").exists()).toBe(true);
    expect(wrapper.text()).toContain("5 hours ago");
  });

  it("explains an unconfigured schedule instead of showing an empty list", async () => {
    const wrapper = await mountApp(baseConfig, {
      ...upcoming,
      unavailable: true,
      error: "quota exhausted",
      flights: [],
    });
    await wrapper.findAll("button.tabs__tab")[1]!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Schedule out of date");
    expect(wrapper.text()).toContain("quota exhausted");
  });

  it("says so plainly when nothing big is due", async () => {
    const wrapper = await mountApp(baseConfig, { ...upcoming, flights: [] });
    await wrapper.findAll("button.tabs__tab")[1]!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Nothing big due in the next 12 hours");
    expect(wrapper.text()).toContain("409 arrivals scheduled");
  });

  it("surfaces a failed request rather than showing a blank tab", async () => {
    const wrapper = await mountApp(baseConfig, null);
    await wrapper.findAll("button.tabs__tab")[1]!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("upcoming request failed");
  });
});
