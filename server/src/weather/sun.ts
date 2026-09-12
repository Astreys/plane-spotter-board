/**
 * Is the sun up at the airport?
 *
 * Only the weather icon asks, to choose between a sun and a moon. METAR carries
 * no day/night flag, so this works it out from the airport's coordinates using
 * the standard low-precision solar position - good to a fraction of a degree,
 * which is far more than an icon needs. A fixed "day is 06:00 to 18:00" would be
 * wrong for half the year at Heathrow and all winter anywhere further north.
 */

const RAD = Math.PI / 180;

/** J2000.0 (2000-01-01T12:00Z) as days since the Unix epoch. */
const J2000_EPOCH_DAYS = 10957.5;

/**
 * Where the sun's centre sits when it "rises": refraction lifts it by about half
 * a degree and the disc is about half a degree across, so sunrise happens while
 * the centre is still slightly below the geometric horizon.
 */
const HORIZON_DEG = -0.833;

/** The sun's elevation above the horizon, in degrees. Negative is below it. */
export function sunElevationDeg(at: Date, lat: number, lon: number): number {
  const days = at.getTime() / 86_400_000 - J2000_EPOCH_DAYS;

  const meanAnomaly = (357.529 + 0.98560028 * days) * RAD;
  const meanLongitude = 280.459 + 0.98564736 * days;
  const eclipticLongitude =
    (meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) * RAD;
  const obliquity = (23.439 - 0.00000036 * days) * RAD;

  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));
  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(eclipticLongitude),
    Math.cos(eclipticLongitude),
  );

  // Greenwich mean sidereal time in hours, shifted to the airport's longitude.
  const siderealHours = 18.697374558 + 24.06570982441908 * days;
  const hourAngle = (siderealHours * 15 + lon) * RAD - rightAscension;

  const latitude = lat * RAD;
  const sinElevation =
    Math.sin(latitude) * Math.sin(declination) +
    Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle);

  return Math.asin(sinElevation) / RAD;
}

export function isDaylight(at: Date, lat: number, lon: number): boolean {
  return sunElevationDeg(at, lat, lon) > HORIZON_DEG;
}
