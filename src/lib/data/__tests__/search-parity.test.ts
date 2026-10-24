// SQLite FTS5 and the fixtures matcher must rank identically: load the fixture products into a real
// FTS5 table (same schema and indexed text as scripts/build-db.ts) and compare both sources query by query.
import { afterAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSqliteSource } from '../sqlite';
import { createFixtureSource } from '../fixtures';
import { normalizeFa } from '../../domain/normalize';
import type { Product } from '../types';

const products: Product[] = JSON.parse(fs.readFileSync(path.resolve('data/fixtures/products.json'), 'utf8'));
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'parity-')), 'p.sqlite');
const db = new Database(file);
// schema as in scripts/build-db.ts (the source prepares statements on every table)
db.exec(`CREATE TABLE shops(rid INTEGER PRIMARY KEY, id TEXT UNIQUE, name TEXT, address TEXT, location_label TEXT, lat REAL, lon REAL,
    complex_id TEXT, floor REAL, unit TEXT, parse_confidence TEXT, installment INT, torob_pay INT,
    providers_json TEXT, hours_json TEXT, phone TEXT, categories_json TEXT, fast_delivery INT);
  CREATE TABLE products(rid INTEGER PRIMARY KEY, id TEXT UNIQUE, title TEXT, brand TEXT, category TEXT,
    images_json TEXT, key_specs_json TEXT, min_price INT, max_price INT, shop_count INT, fresh_share REAL, fresh_share_30 REAL);
  CREATE TABLE offers(rid INTEGER PRIMARY KEY, product_rid INT, shop_rid INT, price INT, last_changed_at TEXT,
    seller_title TEXT, warranty TEXT, description TEXT, is_outlier INT);
  CREATE TABLE complexes(id TEXT PRIMARY KEY, name TEXT, centroid_lat REAL, centroid_lon REAL, shop_count INT);
  CREATE TABLE areas(location_label TEXT PRIMARY KEY, centroid_lat REAL, centroid_lon REAL, shop_count INT);
  CREATE VIRTUAL TABLE products_fts USING fts5(text, content='', tokenize='unicode61 remove_diacritics 2');`);
const insP = db.prepare('INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
const insF = db.prepare('INSERT INTO products_fts(rowid, text) VALUES (?,?)');
products.forEach((p, i) => {
  insP.run(i + 1, p.id, p.title, p.brand, p.category, JSON.stringify(p.images), JSON.stringify(p.keySpecs), p.minPrice, p.maxPrice, p.shopCount, p.freshShare, p.freshShare30 ?? p.freshShare);
  insF.run(i + 1, normalizeFa(`${p.title} ${p.brand ?? ''} ${p.category}`));
});
db.close();
afterAll(() => fs.rmSync(path.dirname(file), { recursive: true, force: true }));

const sqlite = createSqliteSource(file);
const fixtures = createFixtureSource();

// words from the fixture titles themselves + the eval's query shapes
const words = [...new Set(products.flatMap((p) => normalizeFa(p.title).split(' ')).filter((w) => w.length > 2))].slice(0, 40);
const QUERIES = [
  'گوشی سامسونگ S25 FE',
  'redmi buds 8 active',
  'هندزفری بی‌سیم ورزشی',
  'هندزفری میخوام',
  'اسپیکر جی بی ال',
  'شارژر ۲۰ وات اپل',
  'galaxy s25 fe 256',
  'samsong galaxy s25 fe',
  'jbl flip6',
  'کاور گوشی آیفون ۱۶',
  'ایرپاد پرو ۲',
  'گوشی',
  '',
  ...words,
  ...products.slice(0, 15).map((p) => p.title),
];

describe('search parity: sqlite FTS5 ≡ fixtures', () => {
  it.each(QUERIES.map((q) => [q]))('%s', async (q) => {
    for (const extra of [{}, { maxPrice: 50_000_000 }]) {
      const a = (await sqlite.searchProducts({ text: q, limit: 12, ...extra })).map((p) => p.id);
      const b = (await fixtures.searchProducts({ text: q, limit: 12, ...extra })).map((p) => p.id);
      expect(a).toEqual(b);
    }
  });
});
