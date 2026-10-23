import { describe, expect, it } from 'vitest';
import { openInfo, todayLabel, willBeOpenAt, tehranClock } from '../hours';
import { freshnessOf } from '../freshness';
import { parseBudget, buildFtsQuery, contentTokens } from '../query';
import { formatToman, formatRange, relativeFa } from '../format';
import { faText } from '../normalize';
import { etaSync, routeSync } from '../../geo/placeholder';
import { rankOffers } from '../ranking';
import type { OfferWithShop, WeeklyHours } from '../../data/types';

// 2026-10-24 is a Saturday. 10:30 Tehran = 07:00 UTC.
const at = (iso: string) => Date.parse(iso);
const SAT_1030 = at('2026-10-24T07:00:00Z');
const SAT_2000 = at('2026-10-24T16:30:00Z');
const HOURS: WeeklyHours = {
  sat: { status: 'declared', shifts: [{ start: '10:00', end: '19:00' }] },
  sun: { status: 'declared', shifts: [{ start: '10:00', end: '19:00' }] },
  fri: { status: 'closed', shifts: [] },
};

describe('hours', () => {
  it('tehran clock + week starts saturday', () => {
    expect(tehranClock(SAT_1030).day).toBe('sat');
    expect(tehranClock(SAT_1030).minutes).toBe(10 * 60 + 30);
  });
  it('open now with closing time', () => {
    const i = openInfo(HOURS, undefined, SAT_1030);
    expect(i.open).toBe(true);
    expect(i.closesAt).toBe(19 * 60);
    expect(todayLabel(HOURS, undefined, SAT_1030).text).toBe('باز · تا ۱۹:۰۰');
  });
  it('closed in the evening → next opening tomorrow', () => {
    expect(todayLabel(HOURS, undefined, SAT_2000).text).toBe('بسته · فردا ۱۰:۰۰');
  });
  it('unknown hours stay unknown, not closed', () => {
    expect(openInfo(null, undefined, SAT_1030).open).toBeNull();
    expect(todayLabel(null, undefined, SAT_1030).text).toBe('ساعات نامشخص');
  });
  it('override: closed today', () => {
    expect(openInfo(HOURS, { closedToday: true }, SAT_1030).open).toBe(false);
  });
  it('willBeOpenAt detects closing before arrival', () => {
    expect(willBeOpenAt(HOURS, at('2026-10-24T15:45:00Z'), undefined, SAT_1030)).toBe(false); // 19:15
  });
});

describe('freshness', () => {
  const now = at('2026-10-23T12:00:00Z');
  it('buckets', () => {
    expect(freshnessOf('2026-10-20T00:00:00Z', now)).toBe('recent');
    expect(freshnessOf('2026-10-05T00:00:00Z', now)).toBe('aging');
    expect(freshnessOf('2026-06-01T00:00:00Z', now)).toBe('stale');
  });
});

describe('query + format', () => {
  it('parses budgets', () => {
    expect(parseBudget('هندزفری زیر ۵ میلیون')).toEqual({ maxPrice: 5_000_000 });
    expect(parseBudget('بین ۲۰ تا ۳۰ میلیون')).toEqual({ minPrice: 20_000_000, maxPrice: 30_000_000 });
    expect(parseBudget('اسپیکر')).toEqual({});
  });
  it('drops stop words and expands synonyms', () => {
    expect(contentTokens('یه هندزفری میخوام')).toEqual(['هندزفری']);
    expect(buildFtsQuery('اسپیکر جی بی ال')).toContain('"jbl"*');
  });
  it('formats toman', () => {
    expect(formatToman(52_500_000)).toBe('۵۲٫۵ میلیون تومان');
    expect(formatToman(850_000)).toBe('۸۵۰ هزار تومان');
    expect(formatRange(184_000_000, 223_000_000)).toBe('۱۸۴ تا ۲۲۳ میلیون');
    expect(relativeFa(Date.now() - 6 * 86400_000)).toContain('۶');
  });
  it('keeps Latin model numbers', () => {
    expect(faText('گوشی سامسونگ S25 FE 5G | حافظه 256')).toBe('گوشی سامسونگ S25 FE 5G | حافظه ۲۵۶');
  });
});

describe('geo placeholder', () => {
  const a = { lat: 35.7008, lon: 51.4189 };
  const b = { lat: 35.695, lon: 51.4071 };
  it('is deterministic', () => {
    expect(etaSync(a, b, 'walk')).toEqual(etaSync(a, b, 'walk'));
    expect(routeSync(a, b)).toEqual(routeSync(a, b));
  });
  it('walking is slower than driving for ~1.2 km and the route has 2–4 waypoints', () => {
    expect(etaSync(a, b, 'walk').minutes).toBeGreaterThan(etaSync(a, b, 'car').minutes - 6);
    const r = routeSync(a, b);
    expect(r.length).toBeGreaterThanOrEqual(4);
    expect(r.length).toBeLessThanOrEqual(6);
  });
});

describe('ranking', () => {
  const shop = (id: string, lat: number, lon: number) => ({
    id, name: id, address: '', locationLabel: 'فردوسی', lat, lon, floor: null, unit: null, parseConfidence: 'low' as const,
    hours: HOURS, providers: [], installment: false, torobPay: false, categories: [],
  });
  const offer = (id: string, price: number, lat: number, lon: number): OfferWithShop => ({
    id, productId: 'p', shopId: id, price, lastChangedAt: '2026-10-20T00:00:00Z', sellerTitle: '', warranty: null, description: null, shop: shop(id, lat, lon),
  });
  const offers = [offer('far-cheap', 100, 35.75, 51.45), offer('near-mid', 120, 35.7009, 51.419), offer('near-exp', 200, 35.701, 51.4188)];
  const user = { lat: 35.7008, lon: 51.4189 };
  it('sorts by price / distance and puts out-of-stock last', () => {
    expect(rankOffers(offers, user, { sort: 'cheapest', now: SAT_1030 })[0].shopId).toBe('far-cheap');
    expect(rankOffers(offers, user, { sort: 'nearest', now: SAT_1030 })[0].shopId).toBe('near-mid');
    const r = rankOffers(offers, user, {
      sort: 'cheapest',
      now: SAT_1030,
      inquiries: { 'far-cheap': { status: 'replied', outcome: 'out_of_stock', newPrice: null, repliedAt: null } },
    });
    expect(r.at(-1)!.shopId).toBe('far-cheap');
  });
  it('builds a reason line', () => {
    const best = rankOffers(offers, user, { sort: 'best', now: SAT_1030 })[0];
    expect(best.reason).toMatch(/متر|کیلومتر/);
  });
});
