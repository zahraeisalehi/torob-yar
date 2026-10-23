import type { LatLon } from './haversine';

export type TravelMode = 'walk' | 'car';
export type Eta = { minutes: number; distanceM: number; mode: TravelMode; approximate: true };
export type Place = { name: string; lat: number; lon: number; kind: 'area' | 'preset' };

/** Every geo service goes through this (UI_SPEC §3.4). Swap in Neshan via GEO_PROVIDER=neshan later. */
export interface GeoProvider {
  name: string;
  search(q: string): Promise<Place[]>;
  reverse(lat: number, lon: number, label?: string): Promise<string[]>;
  eta(from: LatLon, to: LatLon, mode: TravelMode): Promise<Eta>;
  route(from: LatLon, to: LatLon): Promise<[number, number][]>;
}
