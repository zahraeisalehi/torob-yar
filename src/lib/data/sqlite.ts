import Database from 'better-sqlite3';
import path from 'node:path';
import type { Area, ComplexResult, DataSource, OfferWithShop, Product, SearchQuery, Shop } from './types';
import { offerFromRow, productFromRow, shopFromRow, type OfferRow, type ProductRow, type ShopRow } from './rows';
import { buildFtsQuery } from '../domain/query';
import { normalizeFa } from '../domain/normalize';

const SHOP_SELECT = `SELECT s.*, c.name AS complex_name FROM shops s LEFT JOIN complexes c ON c.id = s.complex_id`;

export function createSqliteSource(file: string): DataSource {
  const db = new Database(path.resolve(file), { readonly: true, fileMustExist: true });
  db.pragma('query_only = ON');
  db.pragma('cache_size = -32000');
  const q = {
    product: db.prepare<[string], ProductRow>('SELECT * FROM products WHERE id = ?'),
    offers: db.prepare<[string], OfferRow & { s_rid: number }>(
      `SELECT o.rid, p.id AS product_id, s.id AS shop_id, o.price, o.last_changed_at, o.seller_title, o.warranty, o.description, s.rid AS s_rid
       FROM offers o JOIN products p ON p.rid = o.product_rid JOIN shops s ON s.rid = o.shop_rid
       WHERE p.id = ? AND o.is_outlier = 0`,
    ),
    shopsByRid: (rids: number[]) =>
      db.prepare<number[], ShopRow>(`${SHOP_SELECT} WHERE s.rid IN (${rids.map(() => '?').join(',')})`).all(...rids),
    shop: db.prepare<[string], ShopRow>(`${SHOP_SELECT} WHERE s.id = ?`),
    complex: db.prepare<[string], { id: string; name: string; centroid_lat: number; centroid_lon: number; shop_count: number }>(
      'SELECT * FROM complexes WHERE id = ?',
    ),
    complexShops: db.prepare<[string], ShopRow>(`${SHOP_SELECT} WHERE s.complex_id = ?`),
    sellersInComplex: db.prepare<[string, string], { id: string }>(
      `SELECT DISTINCT s.id FROM offers o JOIN shops s ON s.rid = o.shop_rid JOIN products p ON p.rid = o.product_rid
       WHERE s.complex_id = ? AND p.id = ? AND o.is_outlier = 0`,
    ),
    areas: db.prepare<[], { location_label: string; centroid_lat: number; centroid_lon: number; shop_count: number }>(
      'SELECT * FROM areas ORDER BY shop_count DESC',
    ),
    count: (t: string) => (db.prepare(`SELECT count(*) AS c FROM ${t}`).get() as { c: number }).c,
  };

  let counts: { shops: number; products: number; offers: number } | null = null;

  return {
    kind: 'sqlite',
    async searchProducts(sq: SearchQuery): Promise<Product[]> {
      const match = buildFtsQuery(sq.text);
      const where: string[] = [];
      const params: (string | number)[] = [];
      if (sq.maxPrice) {
        where.push('p.min_price <= ?');
        params.push(sq.maxPrice);
      }
      if (sq.minPrice) {
        where.push('p.max_price >= ?');
        params.push(sq.minPrice);
      }
      if (sq.brand) {
        where.push('(p.brand = ? OR p.title LIKE ?)');
        params.push(sq.brand, `%${sq.brand}%`);
      }
      if (sq.category) {
        where.push('p.category LIKE ?');
        params.push(`%${sq.category}%`);
      }
      const limit = sq.limit ?? 12;
      let rows: (ProductRow & { rank: number })[];
      if (match) {
        rows = db
          .prepare<(string | number)[], ProductRow & { rank: number }>(
            `SELECT p.*, bm25(products_fts) AS rank FROM products_fts f JOIN products p ON p.rid = f.rowid
             WHERE products_fts MATCH ? ${where.length ? 'AND ' + where.join(' AND ') : ''}
             ORDER BY rank LIMIT 60`,
          )
          .all(match, ...params);
      } else {
        rows = db
          .prepare<(string | number)[], ProductRow & { rank: number }>(
            `SELECT p.*, 0 AS rank FROM products p ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
             ORDER BY p.shop_count DESC LIMIT 60`,
          )
          .all(...params);
      }
      // Title coverage bonus: products whose title contains more of the user's words come first.
      const words = normalizeFa(sq.text).split(' ').filter((w) => w.length > 1);
      const cover = (t: string) => {
        const nt = normalizeFa(t);
        return words.filter((w) => nt.includes(w)).length / Math.max(1, words.length);
      };
      return rows
        .map((r) => ({ r, s: r.rank - 0.15 * Math.log(r.shop_count + 1) - 2 * cover(r.title) }))
        .sort((a, b) => a.s - b.s)
        .slice(0, limit)
        .map((x) => productFromRow(x.r));
    },
    async getProduct(id) {
      const r = q.product.get(id);
      return r ? productFromRow(r) : null;
    },
    async getProducts(ids) {
      return ids.map((id) => q.product.get(id)).filter((r): r is ProductRow => !!r).map(productFromRow);
    },
    async getOffers(productId): Promise<OfferWithShop[]> {
      const rows = q.offers.all(productId);
      if (!rows.length) return [];
      const shops = new Map<number, Shop>();
      for (const r of q.shopsByRid([...new Set(rows.map((r) => r.s_rid))])) shops.set(r.rid, shopFromRow(r));
      // one offer per shop (cheapest) so the map has one pin per shop
      const best = new Map<string, OfferWithShop>();
      for (const r of rows) {
        const shop = shops.get(r.s_rid);
        if (!shop) continue;
        const o = { ...offerFromRow(r), shop };
        const prev = best.get(o.shopId);
        if (!prev || o.price < prev.price) best.set(o.shopId, o);
      }
      return [...best.values()];
    },
    async getShop(id) {
      const r = q.shop.get(id);
      return r ? shopFromRow(r) : null;
    },
    async getComplex(id, productId): Promise<ComplexResult | null> {
      const c = q.complex.get(id);
      if (!c) return null;
      return {
        complex: { id: c.id, name: c.name, centroidLat: c.centroid_lat, centroidLon: c.centroid_lon, shopCount: c.shop_count },
        shops: q.complexShops.all(id).map(shopFromRow),
        offerShopIds: productId ? q.sellersInComplex.all(id, productId).map((r) => r.id) : [],
      };
    },
    async listAreas(): Promise<Area[]> {
      return q.areas.all().map((a) => ({
        locationLabel: a.location_label,
        centroidLat: a.centroid_lat,
        centroidLon: a.centroid_lon,
        shopCount: a.shop_count,
      }));
    },
    async counts() {
      counts ??= { shops: q.count('shops'), products: q.count('products'), offers: q.count('offers') };
      return counts;
    },
  };
}
