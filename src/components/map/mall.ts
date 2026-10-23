import type { Map as MLMap, GeoJSONSource } from 'maplibre-gl';
import type { Shop } from '@/lib/data/types';
import { offsetM } from '@/lib/geo/haversine';

export const MALL_PREFIX = 'mall-floor-';
const SRC = 'mall';

export type MallData = {
  centroid: { lat: number; lon: number };
  shops: Shop[];
  sellerIds: string[];
  targetId: string;
};

export type Cube = { shopId: string; floor: number; floorKnown: boolean; role: 'target' | 'seller' | 'other'; ring: [number, number][] };

/** Procedural footprints: group by floor, sort by unit, lay out a grid around the centroid (5 m squares, 1 m gaps). */
export function layoutCubes(d: MallData): Cube[] {
  const byFloor = new Map<number, Shop[]>();
  for (const s of d.shops) {
    const f = s.floor === null ? 0 : Math.round(s.floor);
    (byFloor.get(f) ?? byFloor.set(f, []).get(f)!).push(s);
  }
  const unitNum = (s: Shop) => {
    const m = (s.unit ?? '').match(/\d+/);
    return m ? Number(m[0]) : Number.MAX_SAFE_INTEGER;
  };
  const cubes: Cube[] = [];
  for (const [floor, shops] of byFloor) {
    shops.sort((a, b) => unitNum(a) - unitNum(b));
    const n = shops.length;
    const cols = Math.max(2, Math.ceil(Math.sqrt(n * 1.6)));
    const rows = Math.ceil(n / cols);
    const cell = 6; // 5 m square + 1 m gap
    shops.forEach((s, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const east = (c - (cols - 1) / 2) * cell;
      const north = ((rows - 1) / 2 - r) * cell;
      const h = 2.5;
      const corners = [
        offsetM(d.centroid, east - h, north - h),
        offsetM(d.centroid, east + h, north - h),
        offsetM(d.centroid, east + h, north + h),
        offsetM(d.centroid, east - h, north + h),
      ];
      const ring = [...corners, corners[0]].map((p) => [p.lon, p.lat] as [number, number]);
      cubes.push({
        shopId: s.id,
        floor,
        floorKnown: s.floor !== null,
        role: s.id === d.targetId ? 'target' : d.sellerIds.includes(s.id) ? 'seller' : 'other',
        ring,
      });
    });
  }
  return cubes;
}

export function floorsOf(cubes: Cube[]): number[] {
  return [...new Set(cubes.map((c) => c.floor))].sort((a, b) => a - b);
}

const COLORS = { target: '#f04f78', seller: '#6b7280', other: '#9aa0aa' };

/** One fill-extrusion layer per floor (+ target layer) because fill-extrusion-opacity is not data-driven. */
export function addMallLayers(map: MLMap, cubes: Cube[], isolate: number | null) {
  removeMallLayers(map);
  const fc = {
    type: 'FeatureCollection' as const,
    features: cubes.map((c) => ({
      type: 'Feature' as const,
      properties: { shopId: c.shopId, floor: c.floor, role: c.role, base: c.floor * 4, top: c.floor * 4 + 3.2, known: c.floorKnown ? 1 : 0 },
      geometry: { type: 'Polygon' as const, coordinates: [c.ring] },
    })),
  };
  if (map.getSource(SRC)) (map.getSource(SRC) as GeoJSONSource).setData(fc);
  else map.addSource(SRC, { type: 'geojson', data: fc });
  // floors below ground: shift everything up so negative floors are still visible above the base map
  const minFloor = Math.min(0, ...cubes.map((c) => c.floor));
  const lift = -minFloor * 4;
  for (const f of floorsOf(cubes)) {
    for (const kind of ['seller', 'other'] as const) {
      map.addLayer({
        id: `${MALL_PREFIX}${f}-${kind}`,
        type: 'fill-extrusion',
        source: SRC,
        filter: ['all', ['==', ['get', 'floor'], f], ['==', ['get', 'role'], kind]],
        paint: {
          'fill-extrusion-color': COLORS[kind],
          'fill-extrusion-base': ['+', ['get', 'base'], lift],
          'fill-extrusion-height': ['+', ['get', 'top'], lift],
          'fill-extrusion-opacity': opacityFor(kind, f, isolate),
        },
      });
    }
  }
  map.addLayer({
    id: `${MALL_PREFIX}target`,
    type: 'fill-extrusion',
    source: SRC,
    filter: ['==', ['get', 'role'], 'target'],
    paint: {
      'fill-extrusion-color': COLORS.target,
      'fill-extrusion-base': ['+', ['get', 'base'], lift],
      'fill-extrusion-height': ['+', ['get', 'top'], lift],
      'fill-extrusion-opacity': 0.95,
    },
  });
  map.addLayer({
    id: `${MALL_PREFIX}outline`,
    type: 'line',
    source: SRC,
    filter: ['==', ['get', 'known'], 0],
    paint: { 'line-color': '#6b7280', 'line-width': 1, 'line-dasharray': [2, 2] },
  });
}

function opacityFor(kind: 'seller' | 'other', floor: number, isolate: number | null) {
  if (isolate !== null && floor !== isolate) return 0.08;
  return kind === 'seller' ? 0.85 : 0.15;
}

export function setIsolation(map: MLMap, cubes: Cube[], isolate: number | null, targetFloor: number | null) {
  for (const f of floorsOf(cubes))
    for (const kind of ['seller', 'other'] as const) {
      const id = `${MALL_PREFIX}${f}-${kind}`;
      if (map.getLayer(id)) map.setPaintProperty(id, 'fill-extrusion-opacity', opacityFor(kind, f, isolate));
    }
  if (map.getLayer(`${MALL_PREFIX}target`))
    map.setPaintProperty(`${MALL_PREFIX}target`, 'fill-extrusion-opacity', isolate !== null && targetFloor !== isolate ? 0.2 : 0.95);
}

export function removeMallLayers(map: MLMap) {
  for (const l of map.getStyle()?.layers ?? []) if (l.id.startsWith(MALL_PREFIX)) map.removeLayer(l.id);
  if (map.getSource(SRC)) map.removeSource(SRC);
}

export function mallLayerIds(map: MLMap): string[] {
  return (map.getStyle()?.layers ?? []).filter((l) => l.id.startsWith(MALL_PREFIX) && l.type === 'fill-extrusion').map((l) => l.id);
}
