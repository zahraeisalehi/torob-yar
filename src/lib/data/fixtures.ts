import fs from 'node:fs';
import path from 'node:path';
import type { Area, Complex, ComplexResult, DataSource, Offer, OfferWithShop, Product, SearchQuery, Shop } from './types';
import { analyzeQuery, CANDIDATE_CAP, docMatches, docTokens, ftsExpression, rankProducts, retrieve, scoreParts, type Group } from '../domain/search';
import { trace, tracing } from '../trace';

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
      const lc = (x: string) => x.toLowerCase();
      // same filters as the SQLite WHERE (LIKE is case-insensitive for Latin)
      const pool = products
        .filter((p) => (!q.maxPrice || p.minPrice <= q.maxPrice) && (!q.minPrice || p.maxPrice >= q.minPrice))
        .filter((p) => !q.brand || p.brand === q.brand || lc(p.title).includes(lc(q.brand)))
        .filter((p) => !q.category || lc(p.category).includes(lc(q.category)));
      const byPop = [...pool].sort((x, y) => y.shopCount - x.shopCount);
      const toks = new Map(products.map((p) => [p.id, docTokens(`${p.title} ${p.brand ?? ''} ${p.category}`)]));
      const a = analyzeQuery(q.text);
      const stages: { mode: string; fts: string | null; rows: number }[] = [];
      const run = (groups: Group[], mode: 'and' | 'or') => {
        const rows = groups.length ? byPop.filter((p) => docMatches(groups, mode, toks.get(p.id)!)).slice(0, CANDIDATE_CAP) : byPop.slice(0, 60);
        if (tracing()) stages.push({ mode: groups.length < a.groups.length ? `${mode}(all but one)` : mode, fts: ftsExpression(groups, mode), rows: rows.length });
        return rows;
      };
      const rows = retrieve(a, run, (p) => p.id);
      const ranked = rankProducts(a, rows, (p) => p).slice(0, q.limit ?? 12);
      trace('search', () => ({
        source: 'fixtures',
        text: q.text,
        filters: { minPrice: q.minPrice, maxPrice: q.maxPrice, brand: q.brand, category: q.category },
        groups: a.groups.map((g) => `${g.raw}${g.model ? '*' : ''}${g.type ? `:${g.type}` : ''}`),
        types: a.types,
        stages,
        top: ranked.map((p) => ({ title: p.title, category: p.category, shopCount: p.shopCount, bm25: null, ...scoreParts(a, p) })),
      }));
      return ranked;
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
