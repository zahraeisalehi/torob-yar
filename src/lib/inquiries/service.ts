import 'server-only';
import crypto from 'node:crypto';
import { env } from '../env';
import { getSource } from '../data/source';
import { tehranClock, todayLabel } from '../domain/hours';
import { formatToman } from '../domain/format';
import { store } from './db';
import type { Inquiry, InquiryDTO, ShopOverride } from './types';

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export async function createInquiry(input: { shopId: string; productId: string; question?: string | null; autoReply?: boolean }): Promise<InquiryDTO> {
  const s = store();
  const existing = s.findPending(input.shopId, input.productId);
  if (existing) {
    if (input.question) {
      existing.question = existing.question ? `${existing.question}\n${input.question}` : input.question;
      s.update(existing);
    }
    return toDTO(existing);
  }
  const offers = await getSource().getOffers(input.productId);
  const offer = offers.find((o) => o.shopId === input.shopId);
  const now = Date.now();
  const auto = env.autoReply && input.autoReply !== false;
  const inq: Inquiry = {
    id: 'inq_' + crypto.randomBytes(6).toString('hex'),
    shopId: input.shopId,
    productId: input.productId,
    offerPrice: offer?.price ?? 0,
    status: 'sent',
    outcome: null,
    newPrice: null,
    question: input.question ?? null,
    answer: null,
    createdAt: now,
    seenAt: null,
    repliedAt: null,
    autoReplyDueAt: auto ? now + Math.round(rand(env.AUTO_REPLY_MIN_S, env.AUTO_REPLY_MAX_S) * 1000) : null,
  };
  s.insert(inq);
  return toDTO(inq);
}

function toDTO(i: Inquiry): InquiryDTO {
  const timedOut = i.status !== 'replied' && !i.autoReplyDueAt && Date.now() - i.createdAt > env.INQUIRY_TIMEOUT_S * 1000;
  return { ...i, status: timedOut ? 'timeout' : i.status };
}

/** Plausible bot answer to a user question, using offer data where possible. */
async function botAnswer(i: Inquiry): Promise<string | null> {
  if (!i.question) return null;
  const offers = await getSource().getOffers(i.productId);
  const offer = offers.find((o) => o.shopId === i.shopId);
  const q = i.question;
  const parts: string[] = [];
  if (/گارانتی|ضمانت/.test(q)) parts.push(offer?.warranty ? `بله، ${offer.warranty}` : 'بله، گارانتی ۱۸ ماهه‌ی شرکتی داره.');
  if (/رنگ/.test(q)) parts.push('بله، مشکی و سفید هم موجود داریم.');
  if (/کنار|نگه/.test(q)) parts.push('حتماً، تا ساعت ۱۸ امروز براتون کنار می‌ذاریم.');
  if (/تا کی|ساعت|باز/.test(q) && offer) parts.push(`امروز ${todayLabel(offer.shop.hours).text.replace('باز · ', '')} هستیم.`);
  if (!parts.length) parts.push('بله، تشریف بیارید در خدمتیم.');
  return parts.join(' ');
}

/** Lazy auto-reply: resolves due inquiries on read. No background jobs. */
async function advance(i: Inquiry): Promise<Inquiry> {
  if (i.status === 'replied' || !i.autoReplyDueAt) return i;
  const now = Date.now();
  const seenDue = i.createdAt + Math.max(1200, (i.autoReplyDueAt - i.createdAt) * 0.45);
  let changed = false;
  if (i.status === 'sent' && now >= seenDue) {
    i.status = 'seen';
    i.seenAt = now;
    changed = true;
  }
  if (i.status === 'seen' && now >= i.autoReplyDueAt && now - (i.seenAt ?? now) >= 1500) {
    const r = Math.random();
    i.outcome = r < 0.7 ? 'confirm' : r < 0.9 ? 'new_price' : 'out_of_stock';
    if (i.outcome === 'new_price') {
      const pct = rand(0.03, 0.12) * (Math.random() < 0.5 ? -1 : 1);
      i.newPrice = Math.round((i.offerPrice * (1 + pct)) / 10000) * 10000 || i.offerPrice;
    }
    i.answer = i.outcome === 'out_of_stock' ? (i.question ? 'متأسفانه تموم کردیم.' : null) : await botAnswer(i);
    i.status = 'replied';
    i.repliedAt = now;
    changed = true;
  }
  if (changed) store().update(i);
  return i;
}

export async function getInquiries(ids: string[], max = 50): Promise<InquiryDTO[]> {
  const list = store().many(ids.slice(0, max));
  const out: InquiryDTO[] = [];
  for (const i of list) out.push(toDTO(await advance(i)));
  return out;
}

export function markSeen(id: string): InquiryDTO | null {
  const i = store().get(id);
  if (!i) return null;
  if (i.status === 'sent') {
    i.status = 'seen';
    i.seenAt = Date.now();
    store().update(i);
  }
  return toDTO(i);
}

export function reply(id: string, r: { outcome: Inquiry['outcome']; newPrice?: number | null; answer?: string | null }): InquiryDTO | null {
  const i = store().get(id);
  if (!i) return null;
  const now = Date.now();
  i.seenAt ??= now;
  i.status = 'replied';
  i.outcome = r.outcome;
  i.newPrice = r.outcome === 'new_price' ? (r.newPrice ?? null) : null;
  i.answer = r.answer?.trim() || null;
  i.repliedAt = now;
  i.autoReplyDueAt = null;
  store().update(i);
  return toDTO(i);
}

export async function shopInbox(shopId: string) {
  const src = getSource();
  const list = store().byShop(shopId);
  for (const i of list) await advance(i);
  const products = await src.getProducts([...new Set(list.map((i) => i.productId))]);
  return {
    shop: await src.getShop(shopId),
    inquiries: list.map((i) => ({ ...toDTO(i), product: products.find((p) => p.id === i.productId) ?? null })),
    override: getOverride(shopId),
  };
}

export function getOverride(shopId: string): ShopOverride | null {
  const o = store().getOverride(shopId);
  return o && o.dateKey === tehranClock().dateKey ? o : null;
}

export function overridesFor(shopIds: string[]): ShopOverride[] {
  const today = tehranClock().dateKey;
  return store()
    .overrides(shopIds.slice(0, 200))
    .filter((o) => o.dateKey === today);
}

export function setToday(shopId: string, v: { closedToday?: boolean; hours?: { start: string; end: string }[] | null }) {
  const prev = getOverride(shopId);
  const o: ShopOverride = {
    shopId,
    closedToday: v.closedToday ?? prev?.closedToday ?? false,
    hoursToday: v.hours === undefined ? (prev?.hoursToday ?? null) : v.hours,
    dateKey: tehranClock().dateKey,
  };
  store().setOverride(o);
  return o;
}

/** Rules-first answer from listed data (§4.1). Returns null when the shop must be asked. */
export async function answerFromData(shopId: string, productId: string, question: string): Promise<string | null> {
  const offers = await getSource().getOffers(productId);
  const offer = offers.find((o) => o.shopId === shopId);
  if (!offer) return null;
  if (/گارانتی|ضمانت/.test(question) && offer.warranty) return `گارانتی: ${offer.warranty}`;
  if (/تا کی|ساعت|باز/.test(question) && offer.shop.hours) {
    const t = todayLabel(offer.shop.hours);
    if (t.tone !== 'unknown') return `امروز: ${t.text}`;
  }
  if (/^.{0,20}قیمت(ش)? (چنده|چقدره)/.test(question)) return `قیمت ثبت‌شده: ${formatToman(offer.price)}`;
  return null;
}
