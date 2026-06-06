// src/lib/targetRanking.ts
// Algorithme de ranking IA physique : magnitude + seeing + lune + altitude

import { CelestialObject } from "@/data/celestialCatalog";

export interface RankedTarget extends CelestialObject {
  score: number;
  altitude: number;
  moonSeparation: number;
  moonIllumination: number;
  isVisible: boolean;
  bestFor: string[];
}

/**
 * Calculate approximate altitude of an object at given time and location.
 * Uses simple hour-angle / declination formula.
 */
export function calculateAltitude(
  raDeg: number,
  decDeg: number,
  date: Date,
  lat: number,
  lon: number,
): number {
  const latRad = (lat * Math.PI) / 180;
  const decRad = (decDeg * Math.PI) / 180;

  // Local Sidereal Time (degrees)
  const lst = calculateLST(date, lon);

  // Hour angle
  const ha = ((lst - raDeg + 360) % 360) * (Math.PI / 180);

  const sinAlt =
    Math.sin(latRad) * Math.sin(decRad) +
    Math.cos(latRad) * Math.cos(decRad) * Math.cos(ha);

  return (Math.asin(Math.max(-1, Math.min(1, sinAlt))) * 180) / Math.PI;
}

/**
 * Approximate Local Sidereal Time in degrees.
 */
function calculateLST(date: Date, lon: number): number {
  const jd = julianDay(date);
  const jd2000 = 2451545.0;
  const T = (jd - jd2000) / 36525.0;

  // Greenwich Mean Sidereal Time (degrees)
  let gmst =
    280.46061837 +
    360.98564736629 * (jd - jd2000) +
    0.000387933 * T * T -
    T * T * T / 38710000;

  gmst = ((gmst % 360) + 360) % 360;

  return ((gmst + lon + 360) % 360);
}

/**
 * Julian Day from Date.
 */
function julianDay(date: Date): number {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate() +
    date.getUTCHours() / 24 +
    date.getUTCMinutes() / 1440 +
    date.getUTCSeconds() / 86400;

  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;

  return (
    d +
    Math.floor((153 * mm + 2) / 5) +
    365 * yy +
    Math.floor(yy / 4) -
    Math.floor(yy / 100) +
    Math.floor(yy / 400) -
    32045
  );
}

/**
 * Calculate moon illumination fraction (0 = new moon, 1 = full moon).
 */
export function calculateMoonIllumination(date: Date): number {
  const jd = julianDay(date);
  const jdNewMoon = 2451550.09765; // Approximate reference new moon
  const lunarCycle = 29.53058867; // Days

  const daysSinceNew = ((jd - jdNewMoon) % lunarCycle + lunarCycle) % lunarCycle;
  const phase = daysSinceNew / lunarCycle;

  // Illumination = (1 - cos(2*pi*phase)) / 2
  return (1 - Math.cos(2 * Math.PI * phase)) / 2;
}

/**
 * Approximate moon RA/DEC for a given date (low accuracy, sufficient for separation).
 */
export function calculateMoonPosition(date: Date): { ra: number; dec: number } {
  const jd = julianDay(date);
  const T = (jd - 2451545.0) / 36525.0;

  const moonLongitude =
    218.316 + 481267.8813 * T -
    0.001328 * T * T +
    T * T * T / 5389 -
    T * T * T * T / 65111;

  const moonLatitude =
    5.134 * Math.sin((moonLongitude - 83.35) * Math.PI / 180);

  const obliquity = 23.439 - 0.013 * T;

  const moonLongRad = moonLongitude * Math.PI / 180;
  const moonLatRad = moonLatitude * Math.PI / 180;
  const oblRad = obliquity * Math.PI / 180;

  const ra = Math.atan2(
    Math.sin(moonLongRad) * Math.cos(oblRad) - Math.tan(moonLatRad) * Math.sin(oblRad),
    Math.cos(moonLongRad),
  ) * 180 / Math.PI;

  const dec = Math.asin(
    Math.sin(moonLatRad) * Math.cos(oblRad) +
    Math.cos(moonLatRad) * Math.sin(oblRad) * Math.sin(moonLongRad),
  ) * 180 / Math.PI;

  return { ra: ((ra % 360) + 360) % 360, dec };
}

/**
 * Angular distance between two RA/DEC positions in degrees.
 */
export function angularDistance(
  ra1: number, dec1: number,
  ra2: number, dec2: number,
): number {
  const d1 = dec1 * Math.PI / 180;
  const d2 = dec2 * Math.PI / 180;
  const da = (ra1 - ra2) * Math.PI / 180;

  return Math.acos(
    Math.min(1, Math.max(-1,
      Math.sin(d1) * Math.sin(d2) +
      Math.cos(d1) * Math.cos(d2) * Math.cos(da),
    )),
  ) * 180 / Math.PI;
}

/**
 * Main ranking function: assigns a score (0-100) to each target.
 *
 * Factors:
 *  - Altitude (higher = better): up to +25
 *  - Magnitude (brighter = better): up to +25
 *  - Moon separation (farther from moon = better): up to +25
 *  - Moon illumination (darker = better): up to +15
 *  - Size (larger = better for imaging): up to +10
 *
 * Penalties:
 *  - Altitude < 15°: invisible (score = 0)
 *  - Moon separation < 15°: heavy penalty
 */
export function rankTargets(
  objects: CelestialObject[],
  date: Date,
  lat: number,
  lon: number,
  minAltitude: number = 15,
): RankedTarget[] {
  const moonPos = calculateMoonPosition(date);
  const moonIllum = calculateMoonIllumination(date);

  const ranked: RankedTarget[] = objects.map((obj) => {
    const altitude = calculateAltitude(obj.ra_deg, obj.dec_deg, date, lat, lon);
    const moonSep = angularDistance(obj.ra_deg, obj.dec_deg, moonPos.ra, moonPos.dec);
    const isVisible = altitude >= minAltitude;

    // Score components
    let score = 0;

    if (!isVisible) {
      return { ...obj, score: 0, altitude, moonSeparation: moonSep, moonIllumination: moonIllum, isVisible: false, bestFor: [] };
    }

    // Altitude score: 0-25 (peaks at 60° altitude)
    const altScore = Math.min(25, (altitude / 60) * 25);

    // Magnitude score: 0-25 (brighter = more points, M31 mag 3.4 gets ~22)
    const magScore = Math.max(0, Math.min(25, 25 - (obj.magnitude + 1.46) * 2));

    // Moon separation score: 0-25
    let moonSepScore: number;
    if (moonSep < 15) {
      moonSepScore = moonSep / 15 * 10; // Reduced score near moon
    } else if (moonSep < 30) {
      moonSepScore = 10 + ((moonSep - 15) / 15) * 15;
    } else {
      moonSepScore = 25;
    }

    // Moon illumination score: 0-15 (darker sky = better)
    const moonIllumScore = (1 - moonIllum) * 15;

    // Size score: 0-10 (larger targets better for APS-C)
    const sizeMatch = obj.size_arcmin.match(/([\d.]+)/);
    const sizeVal = sizeMatch ? parseFloat(sizeMatch[1]) : 1;
    const sizeScore = Math.min(10, Math.log2(sizeVal + 1) * 2);

    score = altScore + magScore + moonSepScore + moonIllumScore + sizeScore;

    // Generate best-for tags
    const bestFor: string[] = [];
    if (altitude > 50) bestFor.push("Haute altitude");
    else if (altitude > 30) bestFor.push("Altitude moyenne");
    if (moonSep > 30) bestFor.push("Lune éloignée");
    if (moonIllum < 0.3) bestFor.push("Ciel sombre");
    if (obj.magnitude < 5) bestFor.push("Très brillant");
    else if (obj.magnitude < 8) bestFor.push("Brillant");

    return {
      ...obj,
      score: Math.round(score * 10) / 10,
      altitude: Math.round(altitude * 10) / 10,
      moonSeparation: Math.round(moonSep * 10) / 10,
      moonIllumination: Math.round(moonIllum * 100) / 100,
      isVisible,
      bestFor,
    };
  });

  return ranked.sort((a, b) => {
    if (a.isVisible !== b.isVisible) return a.isVisible ? -1 : 1;
    return b.score - a.score;
  });
}
