import fs from 'node:fs';
import path from 'node:path';
import type { Area, Complex, ComplexResult, DataSource, Offer, OfferWithShop, Product, SearchQuery, Shop } from './types';
import { expandTokens } from '../domain/query';
import { normalizeFa } from '../domain/normalize';

type FixtureBundle = {
  products: Product[];
  offers: Record<string, Offer[]>;
  shops: Shop[];
  complexes: Complex[];
  areas: Area[];
  meta: { shops: number; products: number; offers: number };
};

let cache: FixtureBundle | null = null;

export function fixturesDir(): string {
  const candidates = [path.join(process.cwd(), 'data/fixtures'), path.join(__dirname, '../../../data/fixtures')];
  return candidates.find((d) => fs.existsSync(path.join(d, 'products.json'))) ?? candidates[0];
}

function load(): FixtureBundle {
  if (cache) return cache;
  const dir = fixturesDir();
  const read = <T,>(f: string): T => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as T;
  const products = read<Product[]>('products.json');
  const offers = read<Record<string, Offer[]>>('offers.json');
  const shops = read<Shop[]>('shops.json');
  cache = {
    products,
    offers,
    shops,
    complexes: read<Complex[]>('complexes.json'),
    areas: read<Area[]>('areas.json'),
    meta: { shops: shops.length, products: products.length, offers: Object.values(offers).reduce((n, l) => n + l.length, 0) },
  };
  return cache;
}

export function createFixtureSource(): DataSource {
  return {
    kind: 'fixtures',
    async searchProducts(q: SearchQuery) {
      const { products } = load();
      const tokens = expandTokens(q.text);
      const df = new Map<string, number>();
      const norm = new Map(products.map((p) => [p.id, ' ' + normalizeFa(`${p.title} ${p.brand ?? ''} ${p.category}`) + ' ']));
      for (const t of tokens) df.set(t, products.filter((p) => norm.get(p.id)!.includes(t)).length);
      const scored = products
        .filter((p) => (!q.maxPrice || p.minPrice <= q.maxPrice) && (!q.minPrice || p.maxPrice >= q.minPrice))
        .filter((p) => !q.brand || p.brand === q.brand || p.title.includes(q.brand))
        .filter((p) => !q.category || p.category.includes(q.category))
        .map((p) => {
          const text = norm.get(p.id)!;
          let s = 0;
          for (const t of tokens) if (text.includes(t)) s += Math.log(1 + products.length / (df.get(t) || 1));
          return { p, s: s + 0.15 * Math.log(p.shopCount + 1) };
        })
        .filter((x) => !tokens.length || x.s > 0.15 * Math.log(x.p.shopCount + 1) + 0.01)
        .sort((a, b) => b.s - a.s);
      return scored.slice(0, q.limit ?? 12).map((x) => x.p);
    },
    async getProduct(id) {
      return load().products.find((p) => p.id === id) ?? null;
    },
    async getProducts(ids) {
      const { products } = load();
      return ids.map((id) => products.find((p) => p.id === id)).filter((p): p is Product => !!p);
    },
    async getOffers(productId): Promise<OfferWithShop[]> {
      const { offers, shops } = load();
      const byId = new Map(shops.map((s) => [s.id, s]));
      return (offers[productId] ?? [])
        .map((o) => ({ ...o, shop: byId.get(o.shopId)! }))
        .filter((o) => !!o.shop);
    },
    async getShop(id) {
      return load().shops.find((s) => s.id === id) ?? null;
    },
    async getComplex(id, productId): Promise<ComplexResult | null> {
      const { complexes, shops, offers } = load();
      const complex = complexes.find((c) => c.id === id);
      if (!complex) return null;
      const members = shops.filter((s) => s.complex?.id === id);
      const sellers = new Set((productId ? offers[productId] ?? [] : []).map((o) => o.shopId));
      return { complex, shops: members, offerShopIds: members.filter((s) => sellers.has(s.id)).map((s) => s.id) };
    },
    async listAreas() {
      return load().areas;
    },
    async counts() {
      return load().meta;
    },
  };
}
