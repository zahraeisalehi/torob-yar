import { normalizeFa, toAsciiDigits } from './normalize';

/** Words that carry no product meaning in a shopping request. */
const STOP = new Set(
  'میخوام می خوام میخواهم میخوام میخام بخرم خرید بخرم یه یک با و از که برای تا زیر بالای حدود حداکثر حداقل کمتر بیشتر میلیون میلیونی هزار تومن تومان ارزون ارزان ارزونترین ارزانترین ارزون‌ترین خوب خوبه بهترین قیمت دنبال هستم چی چه کدوم میشه لطفا لطفاً من رو را هم اینو این اون یا مدل نزدیک نزدیکترین فروشگاه مغازه کجا بگو پیدا کن کنم داره دارید باشه باشد مناسب قسطی اقساطی اقساط'.split(
    ' ',
  ),
);

/** Synonym groups: any member pulls in the others (as FTS phrases). */
const SYNONYMS: string[][] = [
  ['سامسونگ', 'samsung', 'galaxy', 'گلکسی'],
  ['اپل', 'apple'],
  ['آیفون', 'ایفون', 'iphone'],
  ['شیائومی', 'شیاومی', 'xiaomi', 'redmi', 'ردمی', 'poco', 'پوکو'],
  ['جی بی ال', 'جی‌بی‌ال', 'jbl'],
  ['هارمن', 'harman'],
  ['هندزفری', 'هدفون', 'هدست', 'ایرپاد', 'ایربادز', 'earbuds', 'airpods'],
  ['گوشی', 'موبایل'],
  ['شارژر', 'آداپتور', 'شارژ'],
  ['اسپیکر', 'بلندگو', 'speaker'],
  ['بی سیم', 'بیسیم', 'بلوتوث', 'بلوتوثی', 'wireless', 'بی‌سیم'],
  ['لپ تاپ', 'لپتاپ', 'laptop', 'نوت بوک'],
  ['ساعت هوشمند', 'اسمارت واچ', 'smartwatch'],
  ['انکر', 'anker'],
  ['هواوی', 'huawei'],
  ['نوکیا', 'nokia'],
  ['سونی', 'sony'],
  ['ورزشی', 'ورزش', 'sport'],
];

export type BudgetParse = { minPrice?: number; maxPrice?: number };

const NUM_WORDS: Record<string, number> = { یک: 1, یه: 1, دو: 2, سه: 3, چهار: 4, پنج: 5, شش: 6, هفت: 7, هشت: 8, نه: 9, ده: 10, بیست: 20, سی: 30, پنجاه: 50, صد: 100 };

/** "زیر ۵ میلیون" → {maxPrice: 5e6}; "۲۰ تا ۳۰ میلیون" → range; "حدود ۱۰ میلیون" → ±20%. */
export function parseBudget(text: string): BudgetParse {
  const t = toAsciiDigits(text).replace(/[,٬]/g, '').replace(/٫/g, '.');
  const num = '(\\d+(?:\\.\\d+)?|' + Object.keys(NUM_WORDS).join('|') + ')';
  const unit = '\\s*(میلیون|میلیارد|هزار|تومن|تومان|م)?';
  const val = (n: string, u?: string) => {
    const x = NUM_WORDS[n] ?? Number(n);
    const mult = u === 'میلیارد' ? 1e9 : u === 'هزار' ? 1e3 : u === 'میلیون' || u === 'م' ? 1e6 : x < 1000 ? 1e6 : 1;
    return x * mult;
  };
  const range = t.match(new RegExp(`(?:بین\\s*)?${num}${unit}\\s*(?:تا|-|و)\\s*${num}\\s*(میلیون|میلیارد|هزار)`));
  if (range) {
    const u = range[5] ?? range[2];
    return { minPrice: val(range[1], range[2] ?? u), maxPrice: val(range[3], u) };
  }
  const under = t.match(new RegExp(`(?:زیر|کمتر از|حداکثر|تا سقف|تا|نهایت)\\s*${num}${unit}`));
  if (under && (under[2] || /زیر|کمتر|حداکثر|سقف/.test(under[0]))) return { maxPrice: val(under[1], under[2]) };
  const over = t.match(new RegExp(`(?:بالای|بیشتر از|حداقل)\\s*${num}${unit}`));
  if (over) return { minPrice: val(over[1], over[2]) };
  const about = t.match(new RegExp(`(?:حدود|حدودا|در حد|تقریبا)\\s*${num}${unit}`));
  if (about) {
    const v = val(about[1], about[2]);
    return { minPrice: v * 0.75, maxPrice: v * 1.2 };
  }
  return {};
}

/** Strip budget phrases so they don't pollute the full-text query. */
export function stripBudget(text: string): string {
  return toAsciiDigits(text)
    .replace(/(بین\s*)?\d+(\.\d+)?\s*(میلیون|میلیارد|هزار)?\s*(تا|-)\s*\d+(\.\d+)?\s*(میلیون|میلیارد|هزار|تومن|تومان)/g, ' ')
    .replace(/(زیر|کمتر از|حداکثر|تا سقف|بالای|بیشتر از|حداقل|حدود|حدودا|در حد|تقریبا)?\s*\d+(\.\d+)?\s*(میلیون|میلیارد|هزار|تومن|تومان)/g, ' ');
}

export function wantsInstallment(text: string): boolean {
  return /قسط|اقساط|قسطی|اقساطی/.test(text);
}

export function contentTokens(text: string): string[] {
  return normalizeFa(stripBudget(text))
    .split(' ')
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** FTS5 MATCH expression: content tokens OR'ed with prefix matching, plus synonym phrases. */
export function buildFtsQuery(text: string): string | null {
  const norm = ' ' + normalizeFa(stripBudget(text)) + ' ';
  const terms = new Set<string>();
  for (const group of SYNONYMS) {
    const ng = group.map((g) => normalizeFa(g));
    if (ng.some((g) => norm.includes(' ' + g + ' ') || (g.length > 3 && norm.includes(' ' + g)))) {
      for (const g of ng) terms.add(g);
    }
  }
  for (const t of contentTokens(text)) terms.add(t);
  if (!terms.size) return null;
  return [...terms]
    .map((t) => {
      const safe = t.replace(/"/g, '');
      return safe.includes(' ') ? `"${safe}"` : safe.length >= 3 ? `"${safe}"*` : `"${safe}"`;
    })
    .join(' OR ');
}

/** Same expansion for the fixtures matcher. */
export function expandTokens(text: string): string[] {
  const q = buildFtsQuery(text);
  if (!q) return [];
  return q.split(' OR ').map((p) => p.replace(/[*"]/g, ''));
}

/** Latin/digit model tokens like "s25", "a55", "20w" — used to decide "specific enough". */
export function modelTokens(text: string): string[] {
  return normalizeFa(text)
    .split(' ')
    .filter((t) => /[a-z]/.test(t) && /\d/.test(t) && t.length >= 2);
}

/**
 * Shared reranker for both data sources (returns best first).
 * relevance (bm25 relative to the best hit) + popularity (shops carrying it) + coverage of the
 * user's words + a head-noun bonus: Persian titles lead with the product type, so "گوشی …"
 * beats "باتری گوشی …" for a phone request.
 */
export function rerank<T>(
  rows: T[],
  text: string,
  get: (r: T) => { title: string; category: string; shopCount: number; rank: number },
): T[] {
  const words = contentTokens(text);
  const head = words[0];
  const heads = head ? [head, ...(SYNONYMS.find((g) => g.map((x) => normalizeFa(x)).includes(head))?.map((x) => normalizeFa(x)) ?? [])] : [];
  const best = Math.min(...rows.map((r) => get(r).rank), -1e-9);
  const scored = rows.map((r) => {
    const g = get(r);
    const nt = normalizeFa(g.title);
    const nc = normalizeFa(g.category);
    const rel = best < 0 ? Math.max(0, g.rank / best) : 1;
    const cover = words.length ? words.filter((w) => nt.includes(w) || nc.includes(w)).length / words.length : 0;
    const headHit = heads.some((h) => nt.startsWith(h)) ? 1 : heads.some((h) => nc.includes(h)) ? 0.5 : 0;
    const pop = Math.min(1, Math.log(g.shopCount + 1) / Math.log(40));
    return { r, s: 2 * rel + 1.4 * pop + 1.5 * cover + 1.5 * headHit };
  });
  return scored.sort((a, b) => b.s - a.s).map((x) => x.r);
}
