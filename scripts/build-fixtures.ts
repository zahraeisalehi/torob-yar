/* Builds data/fixtures/*.json from data/app.sqlite (DATA.md §8). Run: npm run build:fixtures */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { offerFromRow, productFromRow, shopFromRow, type OfferRow, type ProductRow, type ShopRow } from '../src/lib/data/rows';
import type { Offer, Product, Shop } from '../src/lib/data/types';
import { haversineM } from '../src/lib/geo/haversine';

const ROOT = path.resolve(__dirname, '..');
const DB = process.env.SQLITE_PATH ?? path.join(ROOT, 'data/app.sqlite');
const OUT = path.join(ROOT, 'data/fixtures');
const db = new Database(DB, { readonly: true });
const FERDOWSI = { lat: 35.7008, lon: 51.4189 };

const prod = (sql: string, ...p: unknown[]) => db.prepare<unknown[], ProductRow>(sql).all(...p);

// ---- scenario product picks (DATA.md §2) ----
const scenarios: Record<string, ProductRow[]> = {
  phone: prod(
    `SELECT * FROM products WHERE category = 'گوشی موبایل' AND (title LIKE '%سامسونگ%' OR title LIKE '%شیائومی%')
     ORDER BY shop_count DESC LIMIT 12`,
  ),
  earbuds: [
    ...prod(`SELECT * FROM products WHERE category LIKE 'هدفون%' AND title NOT LIKE '%گردنی%' ORDER BY shop_count DESC LIMIT 9`),
    ...prod(`SELECT * FROM products WHERE category LIKE 'هدفون%' AND title LIKE '%گردنی%' ORDER BY shop_count DESC LIMIT 3`),
  ],
  jbl: prod(
    `SELECT * FROM products WHERE category LIKE 'اسپیکر%' AND (brand LIKE '%جی بی ال%' OR title LIKE '%جی بی ال%' OR title LIKE '%JBL%')
     ORDER BY shop_count DESC LIMIT 10`,
  ),
  charger: prod(
    `SELECT * FROM products WHERE title LIKE 'شارژر%' AND title NOT LIKE '%فندکی%' AND title NOT LIKE '%پک%'
     AND (title LIKE '%اپل%' OR title LIKE '%سامسونگ%' OR title LIKE '%شیائومی%' OR title LIKE '%انکر%')
     ORDER BY shop_count DESC LIMIT 8`,
  ),
};

const products: Product[] = [];
const offers: Record<string, Offer[]> = {};
const shopRids = new Set<number>();
const offerQ = db.prepare<[number], OfferRow & { s_rid: number }>(
  `SELECT o.rid, p.id AS product_id, s.id AS shop_id, o.price, o.last_changed_at, o.seller_title, o.warranty, o.description, s.rid AS s_rid
   FROM offers o JOIN products p ON p.rid = o.product_rid JOIN shops s ON s.rid = o.shop_rid WHERE o.product_rid = ? AND o.is_outlier = 0`,
);
const scenarioIds: Record<string, string[]> = {};
for (const [name, rows] of Object.entries(scenarios)) {
  scenarioIds[name] = [];
  for (const r of rows) {
    if (products.some((p) => p.id === r.id)) continue;
    products.push(productFromRow(r));
    scenarioIds[name].push(r.id);
    const best = new Map<string, Offer>();
    for (const o of offerQ.all(r.rid)) {
      shopRids.add(o.s_rid);
      const off = offerFromRow(o);
      const prev = best.get(off.shopId);
      if (!prev || off.price < prev.price) best.set(off.shopId, off);
    }
    offers[r.id] = [...best.values()];
  }
}

const SHOP_SELECT = `SELECT s.*, c.name AS complex_name FROM shops s LEFT JOIN complexes c ON c.id = s.complex_id`;
const sellerShops = db
  .prepare<number[], ShopRow>(`${SHOP_SELECT} WHERE s.rid IN (${[...shopRids].map(() => '?').join(',')})`)
  .all(...shopRids);
const complexIds = [...new Set(sellerShops.map((s) => s.complex_id).filter(Boolean))] as string[];
const complexShops = complexIds.length
  ? db.prepare<string[], ShopRow>(`${SHOP_SELECT} WHERE s.complex_id IN (${complexIds.map(() => '?').join(',')})`).all(...complexIds)
  : [];
// ~5 extra installment shops near Ferdowsi (they sell other things; they make the relaxation hint real)
const installmentShops = db
  .prepare<[], ShopRow>(`${SHOP_SELECT} WHERE s.installment = 1`)
  .all()
  .sort((a, b) => haversineM(FERDOWSI, a) - haversineM(FERDOWSI, b))
  .slice(0, 5);

const shopMap = new Map<string, Shop>();
for (const r of [...sellerShops, ...complexShops, ...installmentShops]) {
  const s = shopFromRow(r);
  s.categories = s.categories.slice(0, 3);
  shopMap.set(s.id, s);
}
const shops = [...shopMap.values()];

const complexes = complexIds.length
  ? db
      .prepare<string[], { id: string; name: string; centroid_lat: number; centroid_lon: number; shop_count: number }>(
        `SELECT * FROM complexes WHERE id IN (${complexIds.map(() => '?').join(',')})`,
      )
      .all(...complexIds)
      .map((c) => ({ id: c.id, name: c.name, centroidLat: c.centroid_lat, centroidLon: c.centroid_lon, shopCount: c.shop_count }))
  : [];

const areas = db
  .prepare<[], { location_label: string; centroid_lat: number; centroid_lon: number; shop_count: number }>(
    'SELECT * FROM areas ORDER BY shop_count DESC',
  )
  .all()
  .map((a) => ({ locationLabel: a.location_label, centroidLat: a.centroid_lat, centroidLon: a.centroid_lon, shopCount: a.shop_count }));

// ---- coverage polygon: convex hull of all shops (monotone chain) ----
const pts = db.prepare<[], { lat: number; lon: number }>('SELECT lat, lon FROM shops WHERE lat BETWEEN 35.5 AND 35.9 AND lon BETWEEN 51.1 AND 51.7').all();
const P = pts.map((p) => [p.lon, p.lat] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const lower: [number, number][] = [];
for (const p of P) {
  while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
  lower.push(p);
}
const upper: [number, number][] = [];
for (const p of [...P].reverse()) {
  while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
  upper.push(p);
}
const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
hull.push(hull[0]);

fs.mkdirSync(OUT, { recursive: true });
const write = (f: string, data: unknown) => {
  const s = JSON.stringify(data);
  fs.writeFileSync(path.join(OUT, f), s);
  console.log(`${f.padEnd(16)} ${(s.length / 1024).toFixed(0).padStart(5)} KB`);
  if (s.length > 2 * 1024 * 1024) throw new Error(`${f} exceeds 2 MB`);
};
write('products.json', products);
write('offers.json', offers);
write('shops.json', shops);
write('complexes.json', complexes);
write('areas.json', areas);
write('coverage.json', hull.map(([lon, lat]) => [Number(lon.toFixed(5)), Number(lat.toFixed(5))]));
write('scenario-ids.json', scenarioIds);
console.log(
  `products ${products.length}, offers ${Object.values(offers).reduce((n, l) => n + l.length, 0)}, shops ${shops.length}, complexes ${complexes.length}`,
);
