import { haversineM, offsetM, type LatLon } from './haversine';
import { GENERIC_LANDMARKS, LANDMARKS, PRESET_PLACES } from './landmarks';
import type { Eta, GeoProvider, Place, TravelMode } from './provider';
import { normalizeFa } from '../domain/normalize';

/** mulberry32 PRNG. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Round coordinates so tiny GPS jitter does not change the numbers (no flicker).
const r4 = (x: number) => x.toFixed(4);

/** Deterministic ETA (sync; used client-side in batch for the shop list). */
export function etaSync(from: LatLon, to: LatLon, mode: TravelMode): Eta {
  const rnd = mulberry32(hashSeed(r4(from.lat), r4(from.lon), r4(to.lat), r4(to.lon), mode));
  const straight = haversineM(from, to);
  const detour = 1.2 + rnd() * 0.3;
  const dist = straight * detour;
  let minutes: number;
  if (mode === 'walk') {
    const kmh = 4.5 + rnd() * 0.7;
    minutes = (dist / 1000 / kmh) * 60;
  } else {
    const kmh = 12 + rnd() * 10;
    minutes = (dist / 1000 / kmh) * 60 + 2 + rnd() * 4;
  }
  return { minutes: Math.max(1, Math.round(minutes)), distanceM: Math.round(dist), mode, approximate: true };
}

/** L-shaped / zig-zag polyline that looks like streets. Returns [lon, lat][] */
export function routeSync(from: LatLon, to: LatLon): [number, number][] {
  const rnd = mulberry32(hashSeed('route', r4(from.lat), r4(from.lon), r4(to.lat), r4(to.lon)));
  const n = 2 + Math.floor(rnd() * 3); // 2–4 waypoints
  const pts: [number, number][] = [[from.lon, from.lat]];
  let cur = { ...from };
  for (let i = 0; i < n; i++) {
    const remaining = n - i;
    const horizontal = i % 2 === 0;
    const frac = remaining === 1 ? 1 : 0.35 + rnd() * 0.4;
    const next = horizontal
      ? { lat: cur.lat, lon: cur.lon + (to.lon - cur.lon) * frac }
      : { lat: cur.lat + (to.lat - cur.lat) * frac, lon: cur.lon };
    const jitter = offsetM(next, (rnd() - 0.5) * 30, (rnd() - 0.5) * 30);
    cur = remaining === 1 ? next : jitter;
    pts.push([cur.lon, cur.lat]);
  }
  pts.push([to.lon, to.lat]);
  return pts;
}

export function reverseSync(lat: number, lon: number, label?: string): string[] {
  const list = (label && LANDMARKS[label]) || GENERIC_LANDMARKS;
  const rnd = mulberry32(hashSeed('rev', r4(lat), r4(lon)));
  const a = Math.floor(rnd() * list.length);
  let b = Math.floor(rnd() * list.length);
  if (b === a) b = (a + 1) % list.length;
  return [list[a], list[b]];
}

export function makePlaceholder(areas: () => Promise<{ locationLabel: string; centroidLat: number; centroidLon: number; shopCount: number }[]>): GeoProvider {
  return {
    name: 'placeholder',
    async search(q: string): Promise<Place[]> {
      const nq = normalizeFa(q);
      const presets: Place[] = PRESET_PLACES.map((p) => ({ ...p, kind: 'preset' }));
      const all: Place[] = [
        ...presets,
        ...(await areas()).map((a) => ({ name: a.locationLabel, lat: a.centroidLat, lon: a.centroidLon, kind: 'area' as const })),
      ];
      if (!nq) return all.slice(0, 8);
      const score = (name: string) => {
        const n = normalizeFa(name);
        if (n === nq) return 3;
        if (n.startsWith(nq)) return 2;
        if (n.includes(nq) || nq.includes(n)) return 1;
        // fuzzy: share a token prefix
        return nq.split(' ').some((t) => t.length > 1 && n.includes(t.slice(0, 3))) ? 0.5 : 0;
      };
      const seen = new Set<string>();
      return all
        .map((p) => ({ p, s: score(p.name) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .map((x) => x.p)
        .filter((p) => (seen.has(p.name) ? false : (seen.add(p.name), true)))
        .slice(0, 8);
    },
    async reverse(lat, lon, label) {
      return reverseSync(lat, lon, label);
    },
    async eta(from, to, mode) {
      return etaSync(from, to, mode);
    },
    async route(from, to) {
      return routeSync(from, to);
    },
  };
}
