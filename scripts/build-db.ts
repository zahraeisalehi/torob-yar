/* Streams data/raw/*.csv into data/app.sqlite (DATA.md is the spec). Run: npm run build:db */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { parse } from 'csv-parse';
import Database from 'better-sqlite3';
import { parseAddress, complexKey } from '../src/lib/domain/address';
import { normalizeBasic, normalizeFa } from '../src/lib/domain/normalize';
import type { DayHours, DayKey, WeeklyHours } from '../src/lib/data/types';

const ROOT = path.resolve(__dirname, '..');
const RAW = path.join(ROOT, 'data/raw');
const OUT = process.env.SQLITE_PATH ? path.resolve(process.env.SQLITE_PATH) : path.join(ROOT, 'data/app.sqlite');
const NOW = Date.now();
export const IMG_PREFIX = 'https://image.torob.com/base/images/';
const DAY = 86_400_000;
const INSTALLMENT = new Set(['اسنپ‌پی', 'دیجی پی', 'تارا', 'ازکی‌وام']);
const SPEC_BLACKLIST = new Set([
  'نام محصول',
  'تاریخ معرفی',
  'سایر توضیحات',
  'توضیحات',
  'اقلام همراه',
  'محتویات جعبه',
  'لینک',
  'سایر ویژگی‌ها',
  'سایر ویژگی ها',
  'ویژگی‌های دیگر',
]);

// Keys a shopper compares on get boosted; cosmetic/administrative keys get pushed down.
const SPEC_BOOST =
  /رم|حافظه داخلی|دوربین اصلی|گنجایش باتری|ظرفیت باتری|اندازه نمایشگر|تراشه|سرعت شارژ|نویز|ضد آب|گواهی پایداری|توان خروجی|توان|بلوتوث|عمر باتری|ماندگاری|مدت زمان|درگاه|نوع اتصال|نرخ نوسازی|اصالت|تکنولوژی شبکه|نوع اتصال/;
const SPEC_DULL = /رنگ|ابعاد|وزن|برند|Brand|^مدل|سازنده|تاریخ|سال عرضه|وضعیت عرضه|جنس|SAR|سبک یا سنگین|نسبت|توضیحات|سایر|دیگر|مشخصات دوربین|نوع باتری|سیستم عامل/;

function rows(file: string) {
  return fs.createReadStream(path.join(RAW, file)).pipe(
    parse({ columns: true, relax_quotes: true, skip_records_with_error: true, bom: true }),
  );
}
const nul = (v: string | undefined) => (v === undefined || v === 'null' || v === '' ? null : v);
function json<T>(v: string | undefined, fallback: T): T {
  const s = nul(v);
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
const isoOf = (v: string | undefined) => {
  const t = Date.parse(nul(v) ?? '');
  // unknown dates are treated as very old (stale) rather than dropped
  return new Date(Number.isFinite(t) ? t : Date.UTC(2020, 0, 1)).toISOString().slice(0, 19) + 'Z';
};
const id8 = (s: string) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
const median = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
function haversineM(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function robustCentroid(pts: { lat: number; lon: number }[]) {
  const mLat = median(pts.map((p) => p.lat));
  const mLon = median(pts.map((p) => p.lon));
  const near = pts.filter((p) => haversineM(mLat, mLon, p.lat, p.lon) <= 150);
  const use = near.length ? near : pts;
  return { lat: median(use.map((p) => p.lat)), lon: median(use.map((p) => p.lon)) };
}

function convertHours(raw: Record<string, { status?: string; shifts?: { start_time: string; end_time: string }[] }>): WeeklyHours | null {
  const keys = Object.keys(raw ?? {});
  if (!keys.length) return null;
  const out: WeeklyHours = {};
  for (const k of keys as DayKey[]) {
    const d = raw[k];
    if (!d) continue;
    if (d.status === 'closed') {
      out[k] = { status: 'closed', shifts: [] };
      continue;
    }
    if (d.status !== 'declared') {
      out[k] = { status: 'unknown', shifts: [] };
      continue;
    }
    const shifts: DayHours['shifts'] = [];
    for (const s of d.shifts ?? []) {
      const st = s.start_time.slice(0, 5);
      let en = s.end_time.slice(0, 5);
      if (st === en) continue;
      if (en === '00:00') en = '24:00';
      shifts.push({ start: st, end: en });
    }
    out[k] = shifts.length ? { status: 'declared', shifts } : { status: 'unknown', shifts: [] };
  }
  return out;
}

async function main() {
  const t0 = Date.now();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  for (const f of [OUT, OUT + '-wal', OUT + '-shm']) if (fs.existsSync(f)) fs.rmSync(f);
  const db = new Database(OUT);
  db.pragma('journal_mode = OFF');
  db.pragma('synchronous = OFF');
  db.exec(`
    CREATE TABLE shops(rid INTEGER PRIMARY KEY, id TEXT UNIQUE, name TEXT, address TEXT, location_label TEXT, lat REAL, lon REAL,
      complex_id TEXT, floor REAL, unit TEXT, parse_confidence TEXT, installment INT, torob_pay INT,
      providers_json TEXT, hours_json TEXT, phone TEXT, categories_json TEXT, fast_delivery INT);
    CREATE TABLE products(rid INTEGER PRIMARY KEY, id TEXT UNIQUE, title TEXT, brand TEXT, category TEXT,
      images_json TEXT, key_specs_json TEXT, min_price INT, max_price INT, shop_count INT, fresh_share REAL);
    -- offers reference products/shops by integer rowid to keep the image small (DATA.md §9); API ids are rebuilt.
    CREATE TABLE offers(rid INTEGER PRIMARY KEY, product_rid INT, shop_rid INT, price INT, last_changed_at TEXT,
      seller_title TEXT, warranty TEXT, description TEXT, is_outlier INT);
    CREATE TABLE complexes(id TEXT PRIMARY KEY, name TEXT, centroid_lat REAL, centroid_lon REAL, shop_count INT);
    CREATE TABLE areas(location_label TEXT PRIMARY KEY, centroid_lat REAL, centroid_lon REAL, shop_count INT);
    CREATE VIRTUAL TABLE products_fts USING fts5(text, content='', tokenize='unicode61 remove_diacritics 2');
  `);

  // ---------- shops ----------
  type ShopRow = {
    id: string; name: string; address: string; label: string; lat: number; lon: number;
    ckey: string | null; cname: string | null; floor: number | null; unit: string | null; conf: string;
    installment: number; torobPay: number; providers: string[]; hours: WeeklyHours | null; phone: string | null;
    cats: string[]; fast: number | null;
  };
  const shops: ShopRow[] = [];
  const parse = { complex: 0, floor: 0, unit: 0 };
  for await (const r of rows('shops.csv')) {
    const pa = parseAddress(r.address);
    if (pa.complex) parse.complex++;
    if (pa.floor !== null) parse.floor++;
    if (pa.unit !== null) parse.unit++;
    const pay = json<{ provider_name: string }[]>(r.payment_options, []);
    const providers = [...new Set(pay.map((p) => p.provider_name).filter(Boolean))];
    const contacts = json<{ channel: string; display_number?: string }[]>(r.contacts, []);
    const phone = contacts.find((c) => c.channel === 'phone')?.display_number ?? null;
    shops.push({
      id: r.shop_id,
      name: normalizeBasic(r.name ?? ''),
      address: (r.address ?? '').trim(),
      label: nul(r.location_label) ?? 'نامشخص',
      lat: Number(r.lat),
      lon: Number(r.lon),
      ckey: pa.complex ? complexKey(pa.complex) : null,
      cname: pa.complex,
      floor: pa.floor,
      unit: pa.unit,
      conf: pa.confidence,
      installment: providers.some((p) => INSTALLMENT.has(p)) ? 1 : 0,
      torobPay: providers.includes('ترب‌پی') ? 1 : 0,
      providers,
      hours: convertHours(json(r.weekly_hours, {})),
      phone,
      cats: json<string[]>(r.category_names, []),
      fast: nul(r.supports_fast_delivery) === null ? null : r.supports_fast_delivery === 'true' ? 1 : 0,
    });
  }
  // complexes: group by canonical key, name = most common display name
  const groups = new Map<string, ShopRow[]>();
  for (const s of shops) if (s.ckey) (groups.get(s.ckey) ?? groups.set(s.ckey, []).get(s.ckey)!).push(s);
  const insC = db.prepare('INSERT INTO complexes VALUES (?,?,?,?,?)');
  const complexIdByKey = new Map<string, string>();
  for (const [key, members] of groups) {
    const names = new Map<string, number>();
    for (const m of members) names.set(m.cname!, (names.get(m.cname!) ?? 0) + 1);
    const name = [...names.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const c = robustCentroid(members);
    const cid = 'cx_' + id8(key);
    complexIdByKey.set(key, cid);
    insC.run(cid, name, c.lat, c.lon, members.length);
  }
  const insS = db.prepare('INSERT INTO shops VALUES (NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  db.transaction(() => {
    for (const s of shops)
      insS.run(
        s.id, s.name, s.address, s.label, s.lat, s.lon, s.ckey ? complexIdByKey.get(s.ckey) : null, s.floor, s.unit,
        s.conf, s.installment, s.torobPay, JSON.stringify(s.providers), s.hours ? JSON.stringify(s.hours) : null,
        s.phone, JSON.stringify(s.cats), s.fast,
      );
  })();
  const areaGroups = new Map<string, ShopRow[]>();
  for (const s of shops) (areaGroups.get(s.label) ?? areaGroups.set(s.label, []).get(s.label)!).push(s);
  const insA = db.prepare('INSERT INTO areas VALUES (?,?,?,?)');
  for (const [label, members] of areaGroups) {
    const lat = median(members.map((m) => m.lat));
    const lon = median(members.map((m) => m.lon));
    insA.run(label, lat, lon, members.length);
  }
  const shopIds = new Set(shops.map((s) => s.id));
  const shopRid = new Map(shops.map((s, i) => [s.id, i + 1]));
  const productRid = new Map<string, number>();
  const ridOf = (pid: string) => productRid.get(pid) ?? (productRid.set(pid, productRid.size + 1), productRid.size);
  console.log(`shops: ${shops.length}, complexes: ${groups.size}, areas: ${areaGroups.size}`);

  // ---------- offers pass 1: per-product prices ----------
  const prices = new Map<string, number[]>();
  for await (const r of rows('offers.csv')) {
    const p = Number(r.price_toman);
    if (!Number.isFinite(p) || !shopIds.has(r.shop_id)) continue;
    (prices.get(r.product_id) ?? prices.set(r.product_id, []).get(r.product_id)!).push(p);
  }
  const medians = new Map<string, number>();
  for (const [pid, ps] of prices) medians.set(pid, median(ps.filter((p) => p >= 1000)));

  // ---------- offers pass 2: insert + stats ----------
  type Stat = { min: number; max: number; shops: Set<string>; fresh: number; n: number };
  const stats = new Map<string, Stat>();
  let dropped = 0;
  let total = 0;
  const insO = db.prepare('INSERT INTO offers VALUES (NULL,?,?,?,?,?,?,?,?)');
  db.exec('BEGIN');
  for await (const r of rows('offers.csv')) {
    const p = Number(r.price_toman);
    if (!Number.isFinite(p) || !shopIds.has(r.shop_id)) continue;
    total++;
    const med = medians.get(r.product_id) ?? p;
    const outlier = p < 1000 || (med > 0 && p > 20 * med) ? 1 : 0;
    if (outlier) dropped++;
    const desc = nul(r.description);
    insO.run(
      ridOf(r.product_id), shopRid.get(r.shop_id), Math.round(p), isoOf(r.last_price_changed_at),
      normalizeBasic(r.seller_title ?? '').slice(0, 90),
      nul(r.warranty), desc ? desc.slice(0, 200) : null, outlier,
    );
    if (outlier) continue;
    let s = stats.get(r.product_id);
    if (!s) stats.set(r.product_id, (s = { min: p, max: p, shops: new Set(), fresh: 0, n: 0 }));
    s.min = Math.min(s.min, p);
    s.max = Math.max(s.max, p);
    s.shops.add(r.shop_id);
    s.n++;
    if (NOW - Date.parse(isoOf(r.last_price_changed_at)) <= 7 * DAY) s.fresh++;
  }
  db.exec('COMMIT');
  db.exec('CREATE INDEX offers_product ON offers(product_rid)');
  db.exec('CREATE INDEX shops_complex ON shops(complex_id)');
  console.log(`offers: ${total}, outliers dropped from stats: ${dropped}`);

  // ---------- products pass 1: brand list + spec key stats per category ----------
  const brandCounts = new Map<string, number>();
  const catCount = new Map<string, number>();
  const keyStats = new Map<string, Map<string, { n: number; vals: Set<string> }>>();
  for await (const r of rows('products.csv')) {
    if (!stats.has(r.product_id)) continue;
    const b = nul(r.brand_name);
    if (b) brandCounts.set(b, (brandCounts.get(b) ?? 0) + 1);
    const cat = r.category_name;
    catCount.set(cat, (catCount.get(cat) ?? 0) + 1);
    const specs = json<{ key: string; value: string }[]>(r.specs, []);
    let ks = keyStats.get(cat);
    if (!ks) keyStats.set(cat, (ks = new Map()));
    for (const sp of specs) {
      if (!sp.key || SPEC_BLACKLIST.has(sp.key) || !sp.value) continue;
      let e = ks.get(sp.key);
      if (!e) ks.set(sp.key, (e = { n: 0, vals: new Set() }));
      e.n++;
      if (e.vals.size < 30) e.vals.add(String(sp.value).slice(0, 60));
    }
  }
  const brands = [...brandCounts.entries()]
    .filter(([b, n]) => n >= 3 && b.length >= 2)
    .map(([b]) => ({ b, norm: normalizeFa(b) }))
    .sort((a, b) => b.norm.length - a.norm.length);
  const keysByCat = new Map<string, string[]>();
  for (const [cat, ks] of keyStats) {
    const n = catCount.get(cat) ?? 1;
    const ranked = [...ks.entries()]
      .map(([k, e]) => ({
        k,
        score:
          (e.n / n) * Math.min(Math.max(e.vals.size, 1), 10) * (e.vals.size > 1 || n < 3 ? 1 : 0.2) * (SPEC_BOOST.test(k) ? 3 : 1) * (SPEC_DULL.test(k) ? 0.15 : 1),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((x) => x.k);
    keysByCat.set(cat, ranked);
  }

  // ---------- products pass 2: insert ----------
  const insP = db.prepare('INSERT INTO products(rid,id,title,brand,category,images_json,key_specs_json,min_price,max_price,shop_count,fresh_share) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  const insF = db.prepare('INSERT INTO products_fts(rowid, text) VALUES (?,?)');
  let nP = 0;
  let derived = 0;
  db.exec('BEGIN');
  for await (const r of rows('products.csv')) {
    const st = stats.get(r.product_id);
    if (!st) continue;
    const title = normalizeBasic(r.persian_title ?? '');
    let brand = nul(r.brand_name);
    if (!brand) {
      const nt = ' ' + normalizeFa(title) + ' ';
      const hit = brands.find((x) => nt.includes(' ' + x.norm + ' '));
      if (hit) {
        brand = hit.b;
        derived++;
      }
    }
    const specs = json<{ key: string; value: string }[]>(r.specs, []);
    const want = keysByCat.get(r.category_name) ?? [];
    const key = want
      .map((k) => {
        const s = specs.find((x) => x.key === k);
        return s && !/^نامشخص/.test(String(s.value)) ? { key: k, value: String(s.value).slice(0, 60) } : null;
      })
      .filter(Boolean);
    // store image paths without the common host prefix; the data layer re-adds it
    const images = json<string[]>(r.image_urls, []).slice(0, 3).map((u) => u.replace(IMG_PREFIX, ''));
    const res = insP.run(
      productRid.get(r.product_id), r.product_id, title, brand, r.category_name, JSON.stringify(images), JSON.stringify(key), Math.round(st.min),
      Math.round(st.max), st.shops.size, st.n ? st.fresh / st.n : 0,
    );
    insF.run(res.lastInsertRowid, normalizeFa(`${title} ${brand ?? ''} ${r.category_name}`));
    nP++;
  }
  db.exec('COMMIT');
  db.exec('CREATE INDEX products_shopcount ON products(shop_count)');
  db.exec("INSERT INTO products_fts(products_fts) VALUES('optimize')");
  console.log(`products with sane offers: ${nP} (brand derived for ${derived})`);

  // drop offers of products we didn't keep (no product row)
  const orphan = db.prepare('DELETE FROM offers WHERE product_rid NOT IN (SELECT rid FROM products)').run();
  console.log(`orphan offers removed: ${orphan.changes}`);

  const cnt = (t: string, w = '') => (db.prepare(`SELECT count(*) c FROM ${t} ${w}`).get() as { c: number }).c;
  const nS = cnt('shops');
  console.log('--- stats ---');
  console.log(`shops ${nS} | products ${cnt('products')} | offers ${cnt('offers')} (outliers ${cnt('offers', 'WHERE is_outlier=1')}) | complexes ${cnt('complexes')} | areas ${cnt('areas')}`);
  console.log(
    `parse: complex ${((parse.complex / nS) * 100).toFixed(1)}% floor ${((parse.floor / nS) * 100).toFixed(1)}% unit ${((parse.unit / nS) * 100).toFixed(1)}%`,
  );
  console.log(`installment shops: ${cnt('shops', 'WHERE installment=1')}, torob-pay shops: ${cnt('shops', 'WHERE torob_pay=1')}`);
  db.exec('VACUUM');
  db.close();
  const size = fs.statSync(OUT).size;
  await pipeline(fs.createReadStream(OUT), zlib.createGzip({ level: 9 }), fs.createWriteStream(OUT + '.gz'));
  const gz = fs.statSync(OUT + '.gz').size;
  console.log(`app.sqlite ${(size / 1e6).toFixed(1)} MB, app.sqlite.gz ${(gz / 1e6).toFixed(1)} MB, took ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
