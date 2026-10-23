import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import type { Inquiry, ShopOverride } from './types';
import { env } from '../env';

/** Mutable demo state. SQLite on the Liara disk; in-memory if the disk/native module is unavailable. */
export interface InquiryStore {
  kind: 'sqlite' | 'memory';
  get(id: string): Inquiry | null;
  many(ids: string[]): Inquiry[];
  findPending(shopId: string, productId: string): Inquiry | null;
  byShop(shopId: string): Inquiry[];
  pendingShops(): { shopId: string; n: number }[];
  pendingIds(): string[];
  insert(i: Inquiry): void;
  update(i: Inquiry): void;
  getOverride(shopId: string): ShopOverride | null;
  setOverride(o: ShopOverride): void;
  overrides(shopIds: string[]): ShopOverride[];
  reset(): void;
}

type Row = {
  id: string; shop_id: string; product_id: string; offer_price: number; status: Inquiry['status']; outcome: Inquiry['outcome'];
  new_price: number | null; question: string | null; answer: string | null; created_at: number; seen_at: number | null;
  replied_at: number | null; auto_reply_due_at: number | null;
};
const fromRow = (r: Row): Inquiry => ({
  id: r.id, shopId: r.shop_id, productId: r.product_id, offerPrice: r.offer_price, status: r.status, outcome: r.outcome,
  newPrice: r.new_price, question: r.question, answer: r.answer, createdAt: r.created_at, seenAt: r.seen_at,
  repliedAt: r.replied_at, autoReplyDueAt: r.auto_reply_due_at,
});

function sqliteStore(): InquiryStore {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3') as typeof import('better-sqlite3');
  fs.mkdirSync(env.DATA_RW_DIR, { recursive: true });
  const db = new Database(path.join(env.DATA_RW_DIR, 'inquiries.sqlite'));
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS inquiries(id TEXT PRIMARY KEY, shop_id TEXT, product_id TEXT, offer_price INT, status TEXT,
      outcome TEXT, new_price INT, question TEXT, answer TEXT, created_at INT, seen_at INT, replied_at INT, auto_reply_due_at INT);
    CREATE INDEX IF NOT EXISTS inq_shop ON inquiries(shop_id);
    CREATE TABLE IF NOT EXISTS shop_overrides(shop_id TEXT PRIMARY KEY, closed_today INT, hours_today_json TEXT, updated_at TEXT);
  `);
  const up = db.prepare(`INSERT OR REPLACE INTO inquiries VALUES (@id,@shopId,@productId,@offerPrice,@status,@outcome,@newPrice,@question,@answer,@createdAt,@seenAt,@repliedAt,@autoReplyDueAt)`);
  return {
    kind: 'sqlite',
    get: (id) => {
      const r = db.prepare<[string], Row>('SELECT * FROM inquiries WHERE id = ?').get(id);
      return r ? fromRow(r) : null;
    },
    many: (ids) =>
      ids.length
        ? db.prepare<string[], Row>(`SELECT * FROM inquiries WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids).map(fromRow)
        : [],
    findPending: (shopId, productId) => {
      const r = db
        .prepare<[string, string], Row>(`SELECT * FROM inquiries WHERE shop_id = ? AND product_id = ? AND status != 'replied' ORDER BY created_at DESC LIMIT 1`)
        .get(shopId, productId);
      return r ? fromRow(r) : null;
    },
    byShop: (shopId) =>
      db.prepare<[string], Row>('SELECT * FROM inquiries WHERE shop_id = ? ORDER BY created_at DESC LIMIT 50').all(shopId).map(fromRow),
    pendingShops: () =>
      db
        .prepare<[], { shopId: string; n: number }>(`SELECT shop_id AS shopId, count(*) AS n FROM inquiries WHERE status != 'replied' GROUP BY shop_id ORDER BY max(created_at) DESC LIMIT 50`)
        .all(),
    pendingIds: () =>
      db.prepare<[], { id: string }>(`SELECT id FROM inquiries WHERE status != 'replied' ORDER BY created_at DESC LIMIT 200`).all().map((r) => r.id),
    insert: (i) => up.run(i),
    update: (i) => up.run(i),
    getOverride: (shopId) => {
      const r = db
        .prepare<[string], { shop_id: string; closed_today: number; hours_today_json: string | null; updated_at: string }>('SELECT * FROM shop_overrides WHERE shop_id = ?')
        .get(shopId);
      return r ? { shopId: r.shop_id, closedToday: !!r.closed_today, hoursToday: r.hours_today_json ? JSON.parse(r.hours_today_json) : null, dateKey: r.updated_at } : null;
    },
    setOverride: (o) =>
      db.prepare('INSERT OR REPLACE INTO shop_overrides VALUES (?,?,?,?)').run(o.shopId, o.closedToday ? 1 : 0, o.hoursToday ? JSON.stringify(o.hoursToday) : null, o.dateKey),
    overrides: (ids) =>
      ids.length
        ? db
            .prepare<string[], { shop_id: string; closed_today: number; hours_today_json: string | null; updated_at: string }>(`SELECT * FROM shop_overrides WHERE shop_id IN (${ids.map(() => '?').join(',')})`)
            .all(...ids)
            .map((r) => ({ shopId: r.shop_id, closedToday: !!r.closed_today, hoursToday: r.hours_today_json ? JSON.parse(r.hours_today_json) : null, dateKey: r.updated_at }))
        : [],
    reset: () => db.exec('DELETE FROM inquiries; DELETE FROM shop_overrides;'),
  };
}

function memoryStore(): InquiryStore {
  const inq = new Map<string, Inquiry>();
  const ov = new Map<string, ShopOverride>();
  return {
    kind: 'memory',
    get: (id) => inq.get(id) ?? null,
    many: (ids) => ids.map((id) => inq.get(id)).filter((x): x is Inquiry => !!x),
    findPending: (s, p) => [...inq.values()].filter((i) => i.shopId === s && i.productId === p && i.status !== 'replied').sort((a, b) => b.createdAt - a.createdAt)[0] ?? null,
    byShop: (s) => [...inq.values()].filter((i) => i.shopId === s).sort((a, b) => b.createdAt - a.createdAt).slice(0, 50),
    pendingShops: () => {
      const m = new Map<string, number>();
      for (const i of inq.values()) if (i.status !== 'replied') m.set(i.shopId, (m.get(i.shopId) ?? 0) + 1);
      return [...m.entries()].map(([shopId, n]) => ({ shopId, n }));
    },
    pendingIds: () => [...inq.values()].filter((i) => i.status !== 'replied').map((i) => i.id),
    insert: (i) => void inq.set(i.id, i),
    update: (i) => void inq.set(i.id, i),
    getOverride: (s) => ov.get(s) ?? null,
    setOverride: (o) => void ov.set(o.shopId, o),
    overrides: (ids) => ids.map((id) => ov.get(id)).filter((x): x is ShopOverride => !!x),
    reset: () => {
      inq.clear();
      ov.clear();
    },
  };
}

const g = globalThis as unknown as { __inqStore?: InquiryStore };
export function store(): InquiryStore {
  if (g.__inqStore) return g.__inqStore;
  try {
    g.__inqStore = sqliteStore();
  } catch (e) {
    console.error(JSON.stringify({ msg: 'inquiries sqlite unavailable, using memory', error: String(e) }));
    g.__inqStore = memoryStore();
  }
  return g.__inqStore;
}
