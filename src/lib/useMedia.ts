'use client';
import { useSyncExternalStore } from 'react';

function subscribe(q: string) {
  return (cb: () => void) => {
    const m = window.matchMedia(q);
    m.addEventListener('change', cb);
    return () => m.removeEventListener('change', cb);
  };
}

export function useMedia(q: string, server = false): boolean {
  return useSyncExternalStore(subscribe(q), () => window.matchMedia(q).matches, () => server);
}

export const useIsDesktop = () => useMedia('(min-width: 1024px)');
export const useReducedMotionPref = () => useMedia('(prefers-reduced-motion: reduce)');
