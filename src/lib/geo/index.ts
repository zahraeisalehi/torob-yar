import 'server-only';
import { getSource } from '../data/source';
import { makePlaceholder } from './placeholder';
import type { GeoProvider } from './provider';

let geo: GeoProvider | null = null;
/** GEO_PROVIDER=neshan will add lib/geo/neshan.ts here; placeholder for now (UI_SPEC §3.4). */
export function getGeo(): GeoProvider {
  geo ??= makePlaceholder(() => getSource().listAreas());
  return geo;
}
