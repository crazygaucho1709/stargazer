// src/lib/sun.ts
// Hauteur du Soleil et repères simples pour savoir s'il fait nuit.

const RAD = Math.PI / 180;

/** Hauteur du Soleil au-dessus de l'horizon, en degrés. */
export function calcSunAlt(lat: number, lon: number, date: Date): number {
  const D = date.getTime() / 86400000 - 10957;
  const g = (357.529 + 0.98560028 * D) * RAD;
  const q = 280.459 + 0.98564736 * D;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = 23.439 * RAD;
  const sinDec = Math.sin(e) * Math.sin(L);
  const dec = Math.asin(sinDec);
  const UT = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const GMST = (6.697375 + 0.0657098242 * D + UT) % 24;
  const RA = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / RAD / 15;
  const LHA = ((GMST + lon / 15 - RA) % 24) * 15 * RAD;
  return Math.asin(Math.sin(lat * RAD) * sinDec + Math.cos(lat * RAD) * Math.cos(dec) * Math.cos(LHA)) / RAD;
}

/** Soleil sous cette hauteur : le ciel est assez noir pour le ciel profond. */
export const DARK_SUN_ALT_DEG = -12;

/**
 * Heures à attendre, depuis `from`, avant que le ciel soit noir.
 * 0 s'il l'est déjà, null s'il ne le devient pas dans `maxHours`.
 */
export function hoursUntilDark(lat: number, lon: number, from: Date, maxHours = 18): number | null {
  for (let h = 0; h <= maxHours; h += 0.25) {
    if (calcSunAlt(lat, lon, new Date(from.getTime() + h * 3600_000)) < DARK_SUN_ALT_DEG) return h;
  }
  return null;
}

/**
 * Point du ciel haut sur le méridien, côté sud, à l'instant donné.
 * Sert de direction par défaut à la carte quand la monture n'indique rien de
 * fiable : on regarde le ciel, jamais le sol.
 */
export function highSkyPoint(lat: number, lon: number, date: Date): { raDeg: number; decDeg: number } {
  const D = date.getTime() / 86400000 - 10957.5;
  const gmstHours = (((18.697374558 + 24.06570982441908 * D) % 24) + 24) % 24;
  const lstDeg = (((gmstHours * 15 + lon) % 360) + 360) % 360;
  return { raDeg: lstDeg, decDeg: Math.max(lat - 35, -89) };
}
