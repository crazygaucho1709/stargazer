function parseRaToHours(coord) {
  if (typeof coord === 'number') {
    return coord / 15.0; // Assume numeric input is in degrees
  }
  if (!coord) return 0;
  
  const strCoord = String(coord);
  const match = strCoord.match(/([+-]?\d+)[h°]\s*(\d+)m?\s*([\d.]+)s?"?'?/);
  if (match) {
    const d = parseFloat(match[1]);
    const m = parseFloat(match[2]);
    const s = parseFloat(match[3]);
    const sign = d < 0 || Object.is(d, -0) || strCoord.trim().startsWith('-') ? -1 : 1;
    const value = (Math.abs(d) + m / 60 + s / 3600) * sign;
    if (strCoord.includes('°')) {
      return value / 15.0;
    }
    return value; // already in hours
  }
  
  const parsed = parseFloat(strCoord);
  return isNaN(parsed) ? 0 : parsed / 15.0;
}

function parseDecToDegrees(coord) {
  if (typeof coord === 'number') return coord;
  if (!coord) return 0;
  
  const strCoord = String(coord);
  const match = strCoord.match(/([+-]?\d+)[h°]\s*(\d+)m?\s*([\d.]+)s?"?'?/);
  if (match) {
    const d = parseFloat(match[1]);
    const m = parseFloat(match[2]);
    const s = parseFloat(match[3]);
    const sign = d < 0 || Object.is(d, -0) || strCoord.trim().startsWith('-') ? -1 : 1;
    return (Math.abs(d) + m / 60 + s / 3600) * sign;
  }
  
  const parsed = parseFloat(strCoord);
  return isNaN(parsed) ? 0 : parsed;
}

console.log("06h 45m 08s -> RA:", parseRaToHours("06h 45m 08s"));
console.log("-16° 42' 58\" -> DEC:", parseDecToDegrees("-16° 42' 58\""));
console.log("83.821 -> RA:", parseRaToHours(83.821));
console.log("-5.391 -> DEC:", parseDecToDegrees(-5.391));
