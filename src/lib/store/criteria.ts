'use client';
import { create } from 'zustand';
import { DEFAULT_CRITERIA, type Criteria } from '../agent/blocks';

type S = Criteria & {
  set: (p: Partial<Criteria>) => void;
  reset: () => void;
};

export const useCriteria = create<S>((set) => ({
  ...DEFAULT_CRITERIA,
  set: (p) => set(p),
  reset: () => set({ ...DEFAULT_CRITERIA }),
}));

export const criteriaOf = (s: S): Criteria => ({ budget: s.budget, distanceKm: s.distanceKm, installment: s.installment, openNow: s.openNow });
