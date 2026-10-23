export type LatLon = { lat: number; lon: number };

export function haversineM(a: LatLon, b: LatLon): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Offset a point by metres east/north. */
export function offsetM(p: LatLon, east: number, north: number): LatLon {
  const lat = p.lat + north / 111_320;
  const lon = p.lon + east / (111_320 * Math.cos((p.lat * Math.PI) / 180));
  return { lat, lon };
}

/** Closed ring of a circle as [lon, lat] pairs. */
export function circleRing(c: LatLon, radiusM: number, steps = 64): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const p = offsetM(c, Math.cos(a) * radiusM, Math.sin(a) * radiusM);
    out.push([p.lon, p.lat]);
  }
  return out;
}
