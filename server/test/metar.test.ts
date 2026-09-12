import fs from "node:fs";
import { describe, expect, it } from "vitest";
import type { RawMetar } from "../src/weather/client.js";
import { parseVisibility, relativeHumidity, toObservation } from "../src/weather/metar.js";

/**
 * fixtures/metar-sample.json holds real reports pulled from aviationweather.gov,
 * picked for what each one exercises:
 *
 *   CYYZ  plain fair weather, a single high layer
 *   KJFK  a scattered layer under a broken one, and the "10+" visibility floor
 *   EGLL  an automatic station reporting no cloud, and the "6+" floor
 *   ENGM  light rain under a low overcast, saturated air
 *   EHAM  light rain showers
 *   BIKF  showers nearby but not at the field
 *   KSFO  a few wisps at 300 ft under a broken layer at 900
 *   CYHZ  a gusting wind
 *
 * The cases the sample did not happen to contain - variable and calm wind, a
 * thunderstorm, fog under an obscured sky - are built by hand below and say so.
 */

const reports = JSON.parse(
  fs.readFileSync(new URL("./fixtures/metar-sample.json", import.meta.url), "utf8"),
) as RawMetar[];

function report(icao: string): RawMetar {
  const found = reports.find((entry) => entry.icaoId === icao);
  if (!found) throw new Error(`fixture has no report for ${icao}`);
  return found;
}

function observe(raw: RawMetar) {
  const observation = toObservation(raw);
  if (!observation) throw new Error("report did not parse");
  return observation;
}

/** Hand-built, for cases the real sample did not contain. */
function synthetic(overrides: Partial<RawMetar>): RawMetar {
  return {
    icaoId: "ZZZZ",
    obsTime: 1_789_000_000,
    temp: 10,
    dewp: 5,
    wdir: 270,
    wspd: 8,
    visib: "10+",
    wxString: null,
    clouds: [],
    rawOb: "synthetic",
    ...overrides,
  };
}

describe("toObservation on real reports", () => {
  it("reads fair weather at Pearson", () => {
    const yyz = observe(report("CYYZ"));

    expect(yyz.temperatureC).toBe(15);
    // 15 and 11: METAR has no humidity, but the dewpoint gives it exactly.
    expect(yyz.humidityPct).toBe(77);
    expect(yyz.wind).toEqual({
      directionDeg: 300,
      fromCompass: "WNW",
      speedKt: 5,
      gustKt: null,
      variable: false,
      calm: false,
    });
    expect(yyz.visibilityKm).toBe(24.1);
    expect(yyz.visibilityOrMore).toBe(false);
    expect(yyz.cloudBase).toEqual({ cover: "FEW", baseFt: 25000 });
    expect(yyz.condition).toBe("Mostly clear");
    expect(yyz.icon).toBe("mostly-clear");
    expect(yyz.raw).toMatch(/^METAR CYYZ/);
  });

  it("anchors the time to the observation, not to when we read it", () => {
    const yyz = observe(report("CYYZ"));
    expect(yyz.observedAt).toBe(new Date(report("CYYZ").obsTime! * 1000).toISOString());
  });

  it("reports the ceiling, not a scattered layer beneath it", () => {
    // SCT060 BKN140: the broken layer at 14,000 is what hides an approach.
    const jfk = observe(report("KJFK"));
    expect(jfk.cloudBase).toEqual({ cover: "BKN", baseFt: 14000 });
    expect(jfk.condition).toBe("Mostly cloudy");
  });

  it("keeps a low ceiling visible under low wisps", () => {
    // FEW003 BKN009 at San Francisco: 900 ft is the number that matters.
    expect(observe(report("KSFO")).cloudBase).toEqual({ cover: "BKN", baseFt: 900 });
  });

  it("keeps the visibility floor as a floor", () => {
    const jfk = observe(report("KJFK"));
    expect(jfk.visibilityKm).toBe(16.1);
    expect(jfk.visibilityOrMore).toBe(true);

    // "6+" is the feed's rendering of the ICAO 9999, ten kilometres or more.
    const lhr = observe(report("EGLL"));
    expect(lhr.visibilityKm).toBe(9.7);
    expect(lhr.visibilityOrMore).toBe(true);
  });

  it("calls an automatic station's empty sky clear, with no cloud base", () => {
    const lhr = observe(report("EGLL"));
    expect(lhr.condition).toBe("Clear");
    expect(lhr.icon).toBe("clear");
    expect(lhr.cloudBase).toBeNull();
  });

  it("lets rain at the field outrank the sky", () => {
    const osl = observe(report("ENGM"));
    expect(osl.condition).toBe("Light rain");
    expect(osl.icon).toBe("rain");
    expect(osl.cloudBase).toEqual({ cover: "OVC", baseFt: 1000 });
    expect(osl.humidityPct).toBe(100);
  });

  it("tells showers from steady rain", () => {
    const ams = observe(report("EHAM"));
    expect(ams.condition).toBe("Light rain showers");
    expect(ams.icon).toBe("showers");
  });

  it("does not draw rain for showers that are only nearby", () => {
    // VCSH: in the vicinity, not at the field. The sky decides the icon.
    const kef = observe(report("BIKF"));
    expect(kef.condition).toBe("Showers nearby");
    expect(kef.icon).toBe("mostly-cloudy");
  });

  it("reports gusts", () => {
    const yhz = observe(report("CYHZ"));
    expect(yhz.wind).toMatchObject({ speedKt: 16, gustKt: 23, fromCompass: "WNW" });
  });

  it("parses every report in the sample", () => {
    for (const raw of reports) expect(toObservation(raw), raw.icaoId).not.toBeNull();
  });
});

describe("toObservation on hand-built cases", () => {
  it("has no direction for a variable wind", () => {
    const wind = observe(synthetic({ wdir: "VRB", wspd: 3 })).wind;
    expect(wind).toMatchObject({ variable: true, directionDeg: null, fromCompass: null, speedKt: 3 });
  });

  it("calls zero knots calm, whatever the direction says", () => {
    const wind = observe(synthetic({ wdir: 0, wspd: 0 })).wind;
    expect(wind).toMatchObject({ calm: true, directionDeg: null, speedKt: 0 });
  });

  it("ignores a gust that is not above the mean wind", () => {
    expect(observe(synthetic({ wspd: 12, wgst: 12 })).wind?.gustKt).toBeNull();
  });

  it("lets a thunderstorm outrank the rain it brings", () => {
    const observation = observe(synthetic({ wxString: "+TSRA" }));
    expect(observation.condition).toBe("Thunderstorm");
    expect(observation.icon).toBe("thunder");
  });

  it("grades precipitation but not fog", () => {
    expect(observe(synthetic({ wxString: "+SN" })).condition).toBe("Heavy snow");
    expect(observe(synthetic({ wxString: "FG" })).condition).toBe("Fog");
  });

  it("lets snow outrank the mist that comes with it", () => {
    expect(observe(synthetic({ wxString: "-SN BR" })).condition).toBe("Light snow");
  });

  it("calls an obscured sky obscured when nothing else is reported", () => {
    const observation = observe(synthetic({ clouds: [{ cover: "OVX", base: 200 }] }));
    expect(observation.condition).toBe("Sky obscured");
    expect(observation.icon).toBe("fog");
    expect(observation.cloudBase).toEqual({ cover: "OVX", baseFt: 200 });
  });

  it("skips layers that describe no cloud", () => {
    const observation = observe(synthetic({ clouds: [{ cover: "CLR", base: null }] }));
    expect(observation.condition).toBe("Clear");
    expect(observation.cloudBase).toBeNull();
  });

  it("leaves humidity out when a temperature is missing, rather than guessing", () => {
    expect(observe(synthetic({ temp: null })).humidityPct).toBeNull();
  });

  it("has no wind when the station reports none", () => {
    expect(observe(synthetic({ wspd: null })).wind).toBeNull();
  });

  it("refuses a report with no observation time", () => {
    expect(toObservation(synthetic({ obsTime: undefined }))).toBeNull();
  });
});

describe("relativeHumidity", () => {
  it("matches the textbook value for 20 degrees with a 10 degree dewpoint", () => {
    const rh = relativeHumidity(20, 10);
    expect(rh).toBeGreaterThanOrEqual(52);
    expect(rh).toBeLessThanOrEqual(53);
  });

  it("is saturated when dewpoint meets temperature", () => {
    expect(relativeHumidity(12, 12)).toBe(100);
  });
});

describe("parseVisibility", () => {
  it("converts statute miles, keeping a floor as a floor", () => {
    expect(parseVisibility(15)).toEqual({ km: 24.1, orMore: false });
    expect(parseVisibility("10+")).toEqual({ km: 16.1, orMore: true });
    expect(parseVisibility(0.25)).toEqual({ km: 0.4, orMore: false });
  });

  it("returns nothing rather than zero for a missing value", () => {
    expect(parseVisibility(null)).toEqual({ km: null, orMore: false });
    expect(parseVisibility("")).toEqual({ km: null, orMore: false });
  });
});
