// Solar elevation (NOAA approximation, ±0.5°) — enough to drive a twilight-aware toggle.

const RAD = Math.PI / 180;

export function sunElevation(date, lat, lon) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = (date.getTime() - start) / 864e5; // fractional day of year (UTC)
  const g = 2 * Math.PI / 365 * (day - 1);
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g)
    - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
    - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eot = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
    - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g)); // minutes
  const utcMin = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const solarMin = utcMin + eot + 4 * lon;
  const ha = (solarMin / 4 - 180) * RAD;
  const s = Math.sin(lat * RAD) * Math.sin(decl) + Math.cos(lat * RAD) * Math.cos(decl) * Math.cos(ha);
  return Math.asin(Math.max(-1, Math.min(1, s))) / RAD;
}

// Without a location fix, guess longitude from the standard (non-DST) UTC offset.
export function guessLocation() {
  const y = new Date().getFullYear();
  const std = Math.max(new Date(y, 0, 1).getTimezoneOffset(), new Date(y, 6, 1).getTimezoneOffset());
  return { lat: 50, lon: -std / 60 * 15, guessed: true };
}
