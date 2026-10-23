'use client';
import { create } from 'zustand';
import { useMemo } from 'react';
import type { OfferWithShop, Product } from '../data/types';
import type { InquiryDTO, ShopOverride } from '../inquiries/types';
import type { HoursOverride } from '../domain/hours';
import { rankOffers, type RankedOffer, type SortKey } from '../domain/ranking';
import { api } from '../api';
import { useCriteria } from './criteria';
import { useLocation } from './location';
import { formatDistance, formatToman } from '../domain/format';
import { haversineM } from '../geo/haversine';
import { todayLabel } from '../domain/hours';

export type Notice = {
  id: string;
  kind: 'confirm' | 'new_price' | 'out_of_stock' | 'timeout' | 'answer' | 'info' | 'closed';
  shopId?: string;
  text: string;
  oldPrice?: number;
  newPrice?: number;
  action?: { label: string; shopId: string };
  at: number;
};

type S = {
  productId: string | null;
  product: Product | null;
  offers: OfferWithShop[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  sort: SortKey;
  highlight: { shopId: string; by: 'pin' | 'card'; at: number } | null;
  closedSession: Record<string, true>;
  inquiries: Record<string, InquiryDTO>; // key = shopId (for the current product)
  overrides: Record<string, ShopOverride>;
  notices: Notice[];
  autoInquired: Record<string, true>; // productId → done
  closedFlow: string | null; // shopId the user reported closed → show open alternatives
  setClosedFlow: (shopId: string | null) => void;
  load: (productId: string, hint?: Product | null) => Promise<void>;
  setSort: (s: SortKey) => void;
  setHighlight: (shopId: string | null, by?: 'pin' | 'card') => void;
  markClosed: (shopId: string) => void;
  inquire: (shopId: string, question?: string | null) => Promise<InquiryDTO | null>;
  applyInquiries: (list: InquiryDTO[]) => void;
  pushNotice: (n: Omit<Notice, 'id' | 'at'>) => void;
  dismissNotice: (id: string) => void;
  setAutoInquired: (pid: string) => void;
  setOverrides: (list: ShopOverride[]) => void;
};

let nseq = 0;

export const useShops = create<S>((set, get) => ({
  productId: null,
  product: null,
  offers: [],
  status: 'idle',
  error: null,
  sort: 'best',
  highlight: null,
  closedSession: {},
  inquiries: {},
  overrides: {},
  notices: [],
  autoInquired: {},
  closedFlow: null,
  setClosedFlow: (closedFlow) => set({ closedFlow }),
  async load(productId, hint) {
    if (get().productId === productId && (get().status === 'ready' || get().status === 'loading')) return;
    const sameProduct = get().productId === productId;
    set({
      productId,
      product: hint ?? (sameProduct ? get().product : null),
      offers: sameProduct ? get().offers : [],
      status: 'loading',
      error: null,
      inquiries: sameProduct ? get().inquiries : {},
      notices: sameProduct ? get().notices : [],
      highlight: null,
      closedFlow: sameProduct ? get().closedFlow : null,
    });
    try {
      const res = await api.offers(productId);
      if (get().productId !== productId) return;
      set({ product: res.product, offers: res.offers, status: 'ready' });
      api
        .overrides(res.offers.map((o) => o.shopId))
        .then((r) => get().setOverrides(r.overrides))
        .catch(() => {});
    } catch (e) {
      if (get().productId !== productId) return;
      set({ status: 'error', error: e instanceof Error ? e.message : 'خطا' });
    }
  },
  setSort: (sort) => set({ sort }),
  setHighlight: (shopId, by = 'card') => set({ highlight: shopId ? { shopId, by, at: Date.now() } : null }),
  markClosed: (shopId) => set((s) => ({ closedSession: { ...s.closedSession, [shopId]: true } })),
  async inquire(shopId, question) {
    const pid = get().productId;
    if (!pid) return null;
    const existing = get().inquiries[shopId];
    if (existing && existing.status !== 'replied' && existing.status !== 'timeout' && !question) return existing;
    try {
      const manual = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('manual') === '1';
      const { inquiry } = await api.createInquiry({ shopId, productId: pid, question: question ?? null, ...(manual ? { autoReply: false } : {}) });
      if (get().productId !== pid) return inquiry;
      set((s) => ({ inquiries: { ...s.inquiries, [shopId]: inquiry } }));
      return inquiry;
    } catch {
      return null;
    }
  },
  applyInquiries(list) {
    const prev = get().inquiries;
    const next = { ...prev };
    for (const i of list) {
      if (i.productId !== get().productId) continue;
      const before = prev[i.shopId];
      next[i.shopId] = i;
      if (before && before.status !== i.status && (i.status === 'replied' || i.status === 'timeout')) announce(get, i);
    }
    set({ inquiries: next });
  },
  pushNotice: (n) =>
    set((s) => ({ notices: [{ ...n, id: `n${++nseq}`, at: Date.now() }, ...s.notices.filter((x) => !(n.shopId && x.shopId === n.shopId && x.kind === n.kind))].slice(0, 4) })),
  dismissNotice: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
  setAutoInquired: (pid) => set((s) => ({ autoInquired: { ...s.autoInquired, [pid]: true } })),
  setOverrides: (list) => set((s) => ({ overrides: { ...s.overrides, ...Object.fromEntries(list.map((o) => [o.shopId, o])) } })),
}));

function announce(get: () => S, i: InquiryDTO) {
  const s = get();
  const offer = s.offers.find((o) => o.shopId === i.shopId);
  if (!offer) return;
  const name = offer.shop.name;
  const hours = todayLabel(offer.shop.hours);
  const closes = hours.tone === 'open' ? hours.text.replace('باز · ', '') + ' بازن' : '';
  if (i.status === 'timeout') {
    s.pushNotice({ kind: 'timeout', shopId: i.shopId, text: `${name}: فروشنده هنوز جواب نداده` });
    return;
  }
  if (i.outcome === 'confirm') {
    s.pushNotice({
      kind: 'confirm',
      shopId: i.shopId,
      text: `${name}: همه‌چیز اوکیه — موجوده، ${formatToman(offer.price, { unit: false })}${closes ? '، ' + closes : ''}. می‌تونی بری.`,
    });
  } else if (i.outcome === 'new_price' && i.newPrice) {
    s.pushNotice({
      kind: 'new_price',
      shopId: i.shopId,
      text: `${name} قیمت رو به‌روز کرد`,
      oldPrice: offer.price,
      newPrice: i.newPrice,
    });
  } else if (i.outcome === 'out_of_stock') {
    const loc = useLocation.getState();
    const alt = s.offers
      .filter((o) => o.shopId !== i.shopId && s.inquiries[o.shopId]?.status === 'replied' && s.inquiries[o.shopId]?.outcome !== 'out_of_stock')
      .sort((a, b) => haversineM(loc, a.shop) - haversineM(loc, b.shop))[0];
    const fallback =
      alt ??
      s.offers.filter((o) => o.shopId !== i.shopId).sort((a, b) => haversineM(loc, a.shop) - haversineM(loc, b.shop))[0];
    s.pushNotice({
      kind: 'out_of_stock',
      shopId: i.shopId,
      text: alt
        ? `${name}: این یکی تموم کرده؛ نزدیک‌ترین جایگزین تأییدشده: ${alt.shop.name} (${formatDistance(haversineM(loc, alt.shop))})`
        : `${name}: این یکی تموم کرده؛ نزدیک‌ترین جایگزین: ${fallback?.shop.name ?? '—'}`,
      action: fallback ? { label: 'باز کن', shopId: fallback.shopId } : undefined,
    });
  }
  if (i.answer && i.question) s.pushNotice({ kind: 'answer', shopId: i.shopId, text: `پاسخ ${name}: ${i.answer}` });
}

export type FilteredResult = {
  all: RankedOffer[];
  visible: RankedOffer[];
  relaxation: { text: string; apply: () => void; label: string } | null;
};

/** Ranked + filtered offers for the current product (shared by the list and the map). */
export function useRankedOffers(): FilteredResult {
  const offers = useShops((s) => s.offers);
  const sort = useShops((s) => s.sort);
  const inquiries = useShops((s) => s.inquiries);
  const overrides = useShops((s) => s.overrides);
  const closed = useShops((s) => s.closedSession);
  const lat = useLocation((s) => s.lat);
  const lon = useLocation((s) => s.lon);
  const budget = useCriteria((s) => s.budget);
  const distanceKm = useCriteria((s) => s.distanceKm);
  const installment = useCriteria((s) => s.installment);
  const openNow = useCriteria((s) => s.openNow);
  // re-rank once a minute so open/closed stays right
  const minute = Math.floor(Date.now() / 60_000);

  return useMemo(() => {
    const ov: Record<string, HoursOverride> = {};
    for (const [id, o] of Object.entries(overrides)) ov[id] = { closedToday: o.closedToday, hoursToday: o.hoursToday };
    for (const id of Object.keys(closed)) ov[id] = { closedToday: true };
    const inq = Object.fromEntries(
      Object.entries(inquiries).map(([k, v]) => [
        k,
        { status: v.status, outcome: v.outcome, newPrice: v.newPrice, repliedAt: v.repliedAt ? new Date(v.repliedAt).toISOString() : null },
      ]),
    );
    const all = rankOffers(offers, { lat, lon }, { sort, inquiries: inq, overrides: ov });
    const pass = {
      budget: (o: RankedOffer) => (!budget.max || o.effectivePrice <= budget.max) && (!budget.min || o.effectivePrice >= budget.min),
      distance: (o: RankedOffer) => !distanceKm || o.distanceM <= distanceKm * 1000,
      installment: (o: RankedOffer) => !installment || o.shop.installment,
      open: (o: RankedOffer) => !openNow || o.open === true,
    };
    const keys = Object.keys(pass) as (keyof typeof pass)[];
    const visible = all.filter((o) => keys.every((k) => pass[k](o)));
    let relaxation: FilteredResult['relaxation'] = null;
    if (!visible.length && all.length) {
      const c = useCriteria.getState();
      const nearestWhere = (pred: (o: RankedOffer) => boolean) =>
        all.filter(pred).sort((a, b) => a.distanceM - b.distanceM)[0];
      if (installment) {
        const n = nearestWhere((o) => o.shop.installment);
        relaxation = n
          ? {
              text: `نزدیک‌ترین فروشگاه اقساطی ${formatDistance(n.distanceM)} دورتر است — نشان بده؟`,
              label: 'نشان بده',
              apply: () => c.set({ distanceKm: null, openNow: false, budget: { min: null, max: null } }),
            }
          : {
              text: 'هیچ فروشگاه اقساطی‌ای این کالا را ثبت نکرده — بدون شرط اقساط نشان بدهم؟',
              label: 'بدون اقساط',
              apply: () => c.set({ installment: false }),
            };
      } else if (openNow) {
        const n = nearestWhere((o) => pass.distance(o) && pass.budget(o) && o.open === null);
        const soon = all.filter((o) => o.open === false).sort((a, b) => a.distanceM - b.distanceM)[0];
        relaxation = n
          ? { text: `فروشگاه بازِ قطعی پیدا نشد؛ ${n.shop.name} (${formatDistance(n.distanceM)}) ساعت کاری ثبت نکرده — نشانش بدهم؟`, label: 'نشان بده', apply: () => c.set({ openNow: false }) }
          : {
              text: `الان فروشگاه بازی با این کالا پیدا نشد${soon ? ` — نزدیک‌ترین: ${soon.shop.name}، ${todayLabel(soon.shop.hours).text}` : ''}. همه را نشان بدهم؟`,
              label: 'همه را نشان بده',
              apply: () => c.set({ openNow: false }),
            };
      } else if (distanceKm) {
        const n = nearestWhere((o) => pass.budget(o));
        relaxation = n
          ? { text: `نزدیک‌ترین فروشگاه ${formatDistance(n.distanceM)} دورتر است — نشان بده؟`, label: 'نشان بده', apply: () => c.set({ distanceKm: null }) }
          : null;
      }
      if (!relaxation && (budget.max || budget.min)) {
        const cheapest = [...all].sort((a, b) => a.effectivePrice - b.effectivePrice)[0];
        relaxation = {
          text: `با این بودجه فروشگاهی پیدا نشد؛ ارزان‌ترین قیمت ${formatToman(cheapest.effectivePrice)} است — بودجه را بردارم؟`,
          label: 'بودجه را بردار',
          apply: () => c.set({ budget: { min: null, max: null } }),
        };
      }
    }
    return { all, visible, relaxation };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offers, sort, inquiries, overrides, closed, lat, lon, budget, distanceKm, installment, openNow, minute]);
}
