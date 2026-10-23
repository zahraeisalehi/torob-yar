'use client';
import { create } from 'zustand';
import type { MallData, Cube } from '@/components/map/mall';
import type { Shop } from '../data/types';

type S = {
  ready: boolean;
  styleIndex: number;
  mall: {
    complexId: string;
    complexName: string;
    targetShopId: string;
    status: 'loading' | 'ready' | 'error';
    data?: MallData;
    cubes?: Cube[];
    floors?: number[];
    isolate: number | null;
    picked: Shop | null;
  } | null;
  setReady: (v: boolean) => void;
  setStyleIndex: (i: number) => void;
  setMall: (m: S['mall']) => void;
  patchMall: (p: Partial<NonNullable<S['mall']>>) => void;
};

export const useMapStore = create<S>((set) => ({
  ready: false,
  styleIndex: 0,
  mall: null,
  setReady: (ready) => set({ ready }),
  setStyleIndex: (styleIndex) => set({ styleIndex }),
  setMall: (mall) => set({ mall }),
  patchMall: (p) => set((s) => (s.mall ? { mall: { ...s.mall, ...p } } : {})),
}));
