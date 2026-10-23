'use client';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LocateFixed, MapPin, Search, X, Navigation } from 'lucide-react';
import { toast } from 'sonner';
import { useLocation } from '@/lib/store/location';
import { api } from '@/lib/api';
import type { Place } from '@/lib/geo/provider';
import { haversineM } from '@/lib/geo/haversine';
import { DEFAULT_LOCATION, PRESET_PLACES } from '@/lib/geo/landmarks';
import { Button } from './ui/button';
import { Popover } from './CriteriaBar';
import { Approx } from './Badges';

const COVERAGE_RADIUS_M = 25_000;

export function requestGps() {
  const loc = useLocation.getState();
  loc.setAsked();
  if (!navigator.geolocation) {
    toast('مرورگر موقعیت‌یابی ندارد؛ از جست‌وجو یا کشیدن نقطه روی نقشه استفاده کن.');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const p = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      if (haversineM(p, DEFAULT_LOCATION) > COVERAGE_RADIUS_M) {
        useLocation.getState().setOutside(p);
        return;
      }
      useLocation.getState().set({ ...p, source: 'gps', name: 'موقعیت فعلی شما' });
      toast.success('موقعیتت پیدا شد');
    },
    () => toast('اجازه‌ی موقعیت داده نشد؛ موقعیت نمونه (میدان فردوسی) را نگه می‌داریم. می‌تونی جست‌وجو کنی یا نقطه‌ی آبی را بکشی.'),
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
  );
}

/** Friendly explainer shown once on entering step 2 (non-blocking). */
export function LocationExplainer() {
  const asked = useLocation((s) => s.asked);
  const source = useLocation((s) => s.source);
  const outside = useLocation((s) => s.outside);
  const setOutside = useLocation((s) => s.setOutside);
  const setAsked = useLocation((s) => s.setAsked);
  return (
    <AnimatePresence initial={false}>
      {outside ? (
        <motion.div key="out" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="rounded-2xl border border-warn/30 bg-warn-wash p-3 text-[13.5px] leading-6">
          خارج از محدوده داده‌ها هستید — موقعیت نمونه (میدان فردوسی) را نشان بدهم؟
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => setOutside(null)}>
              بله، میدان فردوسی
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                useLocation.getState().set({ ...outside, source: 'gps', name: 'موقعیت فعلی شما' });
                setOutside(null);
              }}
            >
              همین موقعیت من
            </Button>
          </div>
        </motion.div>
      ) : !asked && source === 'default' ? (
        <motion.div key="ask" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="rounded-2xl border border-info/20 bg-info-wash/70 px-3 py-2.5" data-testid="location-explainer">
          <div className="flex items-start gap-2">
            <Navigation className="mt-0.5 size-4 shrink-0 text-info" />
            <p className="text-[13px] leading-6 text-ink-2">
              فاصله‌ها از <b>میدان فردوسی</b> حساب شده. برای دقیق‌تر شدن، موقعیتت را بده.
            </p>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-2 ps-6">
            <Button size="sm" onClick={requestGps} data-testid="use-gps">
              <LocateFixed className="size-4" />
              استفاده از موقعیت من
            </Button>
            <Button size="sm" variant="ghost" onClick={setAsked} data-testid="keep-default">
              فعلاً همین خوبه
            </Button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function LocationChip() {
  const name = useLocation((s) => s.name);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        onClick={() => setOpen(true)}
        className="inline-flex h-9 max-w-full items-center gap-1.5 rounded-full px-2 text-[13px] text-ink-2 hover:bg-surface"
        data-testid="location-chip"
      >
        <MapPin className="size-4 shrink-0 text-info" />
        <span className="truncate">
          از: <b className="font-semibold text-ink">{name}</b>
        </span>
      </button>
      <Popover open={open} anchor={ref} onClose={() => setOpen(false)} title="موقعیت شما">
        <LocationSearch onDone={() => setOpen(false)} />
      </Popover>
    </>
  );
}

function LocationSearch({ onDone }: { onDone: () => void }) {
  const [q, setQ] = useState('');
  const [places, setPlaces] = useState<Place[]>(PRESET_PLACES.map((p) => ({ ...p, kind: 'preset' as const })));
  useEffect(() => {
    const t = setTimeout(() => {
      api
        .geoSearch(q)
        .then((r) => setPlaces(r.places))
        .catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="space-y-3">
      <Button
        className="w-full"
        variant="soft"
        onClick={() => {
          requestGps();
          onDone();
        }}
      >
        <LocateFixed className="size-4" />
        استفاده از موقعیت فعلی (GPS)
      </Button>
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="محله یا میدان: شیخ هادی، بهارستان، انقلاب…"
          className="h-11 w-full rounded-xl border border-line bg-surface ps-9 pe-9 text-[15px] outline-none focus:border-line-strong"
          aria-label="جست‌وجوی محله"
        />
        {q && (
          <button onClick={() => setQ('')} className="absolute end-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full hover:bg-surface-2" aria-label="پاک کردن">
            <X className="size-4" />
          </button>
        )}
      </div>
      <ul className="max-h-60 space-y-1 overflow-y-auto">
        {places.map((p) => (
          <li key={`${p.kind}-${p.name}`}>
            <button
              onClick={() => {
                useLocation.getState().set({ lat: p.lat, lon: p.lon, name: p.name, source: 'search' });
                useLocation.getState().setAsked();
                onDone();
              }}
              className="flex h-11 w-full items-center gap-2 rounded-xl px-2 text-start text-[14px] hover:bg-surface"
            >
              <MapPin className="size-4 text-muted" />
              {p.name}
              {p.kind === 'area' && <span className="ms-auto text-xs text-muted">محله</span>}
            </button>
          </li>
        ))}
      </ul>
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Approx /> نقطه‌ی آبی روی نقشه را هم می‌توانی بکشی.
      </p>
    </div>
  );
}
