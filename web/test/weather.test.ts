import { describe, expect, it } from "vitest";
import {
  formatCloudBase,
  formatHumidity,
  formatReportAge,
  formatTemperature,
  formatVisibility,
  formatWind,
} from "../src/weather";

const wind = {
  directionDeg: 300,
  fromCompass: "WNW",
  speedKt: 6,
  gustKt: null,
  variable: false,
  calm: false,
};

describe("formatWind", () => {
  it("leads with the direction, in knots like the rest of the board", () => {
    expect(formatWind(wind)).toBe("WNW 6 kt");
  });

  it("adds a gust when there is one", () => {
    expect(formatWind({ ...wind, speedKt: 16, gustKt: 23 })).toBe("WNW 16 kt, gusting 23");
  });

  it("says variable rather than inventing a direction", () => {
    expect(formatWind({ ...wind, directionDeg: null, fromCompass: null, variable: true, speedKt: 3 })).toBe(
      "Variable 3 kt",
    );
  });

  it("says calm", () => {
    expect(formatWind({ ...wind, speedKt: 0, calm: true })).toBe("Calm");
  });

  it("shows a placeholder when the station reported no wind", () => {
    expect(formatWind(null)).toBe("--");
  });
});

describe("formatVisibility", () => {
  it("keeps a reported floor as a floor", () => {
    // The feed's "6+" miles is the ICAO "9999", ten kilometres or more.
    expect(formatVisibility(9.7, true)).toBe("10+ km");
    expect(formatVisibility(16.1, true)).toBe("16+ km");
  });

  it("rounds long distances and keeps a decimal for short ones", () => {
    expect(formatVisibility(24.1, false)).toBe("24 km");
    expect(formatVisibility(0.4, false)).toBe("0.4 km");
    expect(formatVisibility(5, false)).toBe("5 km");
  });

  it("shows a placeholder for a missing value, not zero", () => {
    expect(formatVisibility(null, false)).toBe("--");
  });
});

describe("formatCloudBase", () => {
  it("names the cover and the height", () => {
    expect(formatCloudBase({ cover: "BKN", baseFt: 900 })).toBe("Broken 900 ft");
    expect(formatCloudBase({ cover: "FEW", baseFt: 25000 })).toBe("Few 25,000 ft");
  });

  it("reads no layer as a clear sky", () => {
    expect(formatCloudBase(null)).toBe("Clear");
  });
});

describe("formatTemperature", () => {
  it("rounds to a whole degree", () => {
    expect(formatTemperature(22.8)).toBe("23°C");
  });

  it("never prints minus zero", () => {
    expect(formatTemperature(-0.4)).toBe("0°C");
  });

  it("shows a placeholder when the station reported none", () => {
    expect(formatTemperature(null)).toBe("--");
  });
});

describe("formatHumidity", () => {
  it("shows a percentage or a placeholder", () => {
    expect(formatHumidity(68)).toBe("68%");
    expect(formatHumidity(null)).toBe("--");
  });
});

describe("formatReportAge", () => {
  it("counts in minutes, then hours", () => {
    expect(formatReportAge(30)).toBe("just now");
    expect(formatReportAge(19 * 60)).toBe("19 min ago");
    expect(formatReportAge(4 * 3600)).toBe("4 h ago");
  });

  it("is empty when there is no report", () => {
    expect(formatReportAge(null)).toBe("");
  });
});
