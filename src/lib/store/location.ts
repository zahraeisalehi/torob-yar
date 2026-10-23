'use client';
import { create } from 'zustand';
import { DEFAULT_LOCATION } from '../geo/landmarks';

export type LocSource = 'default' | 'gps' | 'search' | 'drag';

type S = {
  lat: number;
  lon: number;
  name: string;
  source: LocSource;
  asked: boolean; // explainer shown / GPS asked once
  outside: { lat: number; lon: number } | null; // GPS fix far outside coverage
  set: (p: { lat: number; lon: number; name?: string; source: LocSource }) => void;
  setAsked: () => void;
  setOutside: (p: { lat: number; lon: number } | null) => void;
};

export const useLocation = create<S>((set) => ({
  lat: DEFAULT_LOCATION.lat,
  lon: DEFAULT_LOCATION.lon,
  name: DEFAULT_LOCATION.name,
  source: 'default',
  asked: false,
  outside: null,
  set: (p) => set({ lat: p.lat, lon: p.lon, name: p.name ?? (p.source === 'gps' ? 'موقعیت فعلی شما' : 'نقطه انتخابی'), source: p.source }),
  setAsked: () => set({ asked: true }),
  setOutside: (outside) => set({ outside }),
}));
