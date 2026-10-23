import type { OfferWithShop } from '../data/types';
import { formatDistance, toFaDigits } from './format';
import { freshnessOf, type FreshState } from './freshness';
import { openInfo, shortHour, type HoursOverride } from './hours';
import { haversineM, type LatLon } from '../geo/haversine';
import { etaSync } from '../geo/placeholder';

export type SortKey = 'best' | 'nearest' | 'cheapest' | 'verified';

export type InquiryView = {
  status: 'sent' | 'seen' | 'replied' | 'timeout';
  outcome: 'confirm' | 'new_price' | 'out_of_stock' | null;
  newPrice: number | null;
  repliedAt: string | null;
};

export type RankedOffer = OfferWithShop & {
  distanceM: number;
  walkMin: number;
  carMin: number;
  open: boolean | null;
  closesAt: number | null;
  fresh: FreshState;
  effectivePrice: number;
  verified: boolean;
  outOfStock: boolean;
  cheapPercentile: number; // share of offers more expensive than this one (0..1)
  cheapTop20: boolean;
  score: number;
  reason: string;
};

export function rankOffers(
  offers: OfferWithShop[],
  user: LatLon,
  opts: {
    sort: SortKey;
    inquiries?: Record<string, InquiryView | undefined>; // by shopId
    overrides?: Record<string, HoursOverride | undefined>; // by shopId
    now?: number;
  },
): RankedOffer[] {
  const now = opts.now ?? Date.now();
  const enriched = offers.map((o) => {
    const inq = opts.inquiries?.[o.shopId];
    const replied = inq?.status === 'replied';
    const verified = replied && inq?.outcome !== 'out_of_stock';
    const outOfStock = replied && inq?.outcome === 'out_of_stock';
    const effectivePrice = replied && inq?.outcome === 'new_price' && inq.newPrice ? inq.newPrice : o.price;
    const pending = inq && (inq.status === 'sent' || inq.status === 'seen');
    const fresh: FreshState = verified ? 'verified' : pending ? 'checking' : freshnessOf(o.lastChangedAt, now);
    const info = openInfo(o.shop.hours, opts.overrides?.[o.shopId], now);
    const distanceM = haversineM(user, o.shop);
    return {
      ...o,
      distanceM,
      walkMin: etaSync(user, o.shop, 'walk').minutes,
      carMin: etaSync(user, o.shop, 'car').minutes,
      open: info.open,
      closesAt: info.closesAt,
      fresh,
      effectivePrice,
      verified: !!verified,
      outOfStock: !!outOfStock,
    };
  });
  const prices = enriched.map((e) => e.effectivePrice).sort((a, b) => a - b);
  const n = prices.length;
  const ranked: RankedOffer[] = enriched.map((e) => {
    const moreExpensive = prices.filter((p) => p > e.effectivePrice).length;
    const cheapPercentile = n > 1 ? moreExpensive / (n - 1) : 1;
    const priceScore = cheapPercentile;
    const distanceScore = Math.exp(-(e.distanceM / 1000) / 1.5);
    const openScore = e.open === true ? 1 : e.open === null ? 0.5 : 0;
    const freshScore = e.fresh === 'verified' ? 1 : e.fresh === 'recent' || e.fresh === 'checking' ? 0.8 : e.fresh === 'aging' ? 0.5 : 0.2;
    const score = 0.4 * priceScore + 0.3 * distanceScore + 0.15 * openScore + 0.15 * freshScore;
    const parts: string[] = [];
    if (n > 2 && cheapPercentile >= 0.5) parts.push(`ارزان‌تر از ${toFaDigits(Math.round(cheapPercentile * 100))}٪`);
    else if (n > 1 && cheapPercentile === 1) parts.push('ارزان‌ترین');
    parts.push(formatDistance(e.distanceM));
    if (e.open === true && e.closesAt !== null) parts.push(`تا ${shortHour(e.closesAt)} باز`);
    else if (e.open === false) parts.push('الان بسته');
    if (e.verified) parts.push('تأیید شده');
    const idx = Math.max(1, Math.ceil(n * 0.2));
    return {
      ...e,
      cheapPercentile,
      cheapTop20: n >= 3 && e.effectivePrice <= prices[idx - 1],
      score,
      reason: parts.join(' · '),
    };
  });
  const cmp: Record<SortKey, (a: RankedOffer, b: RankedOffer) => number> = {
    best: (a, b) => b.score - a.score,
    nearest: (a, b) => a.distanceM - b.distanceM,
    cheapest: (a, b) => a.effectivePrice - b.effectivePrice,
    verified: (a, b) => Number(b.verified) - Number(a.verified) || b.score - a.score,
  };
  return ranked.sort((a, b) => Number(a.outOfStock) - Number(b.outOfStock) || cmp[opts.sort](a, b));
}
