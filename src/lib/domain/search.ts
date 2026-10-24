/**
 * Product retrieval shared by both data sources (SQLite FTS5 and fixtures), so they behave identically:
 *   analyzeQuery(text) → groups (one per meaningful query word, with aliases)
 *   retrieve(a, match) → AND of all groups; else the best "all but one" AND; else OR (match = source-specific)
 *   rankProducts(a, rows) → one deterministic score (no bm25), popularity only as a tie-breaker
 * Matching semantics (mirrored by ftsExpression and docMatches): Latin words and numbers match a whole
 * token exactly; Persian words of ≥4 letters match by prefix; multi-word aliases match as phrases.
 */
import { normalizeFa } from './normalize';
import { STOP, stripBudget } from './query';

export type Alt = { kind: 'exact' | 'prefix'; t: string } | { kind: 'phrase'; ts: string[] };
export type Group = {
  raw: string;
  alts: Alt[];
  /** model token: Latin word, number, or a series word (پرو، مکس، اکتیو…) — must appear in the title */
  model: boolean;
  type?: TypeKey;
  implies?: TypeKey;
};
export type Analysis = { groups: Group[]; types: TypeKey[]; implied: TypeKey[]; accessoryAsked: boolean };

type TypeKey =
  | 'audio' | 'phone' | 'speaker' | 'charger' | 'powerbank' | 'watch' | 'laptop' | 'cctv' | 'shaver' | 'mouse' | 'keyboard'
  | 'cover' | 'battery' | 'glass' | 'cable' | 'lcd';

/** Product types the user can name, the categories they mean, and whether they're accessories. */
const TYPES: Record<TypeKey, { cat: RegExp; accessory?: boolean }> = {
  audio: { cat: /هدفون، هدست و هندزفری/ },
  phone: { cat: /^گوشی موبایل$/ },
  speaker: { cat: /اسپیکر/ },
  charger: { cat: /شارژر/, accessory: true },
  powerbank: { cat: /پاوربانک/ },
  watch: { cat: /ساعت و مچ بند هوشمند/ },
  laptop: { cat: /لپ تاپ و نوت بوک/ },
  cctv: { cat: /دوربین مدار بسته|ضبط کننده ویدیویی/ },
  shaver: { cat: /ماشین اصلاح/ },
  mouse: { cat: /ماوس/ },
  keyboard: { cat: /کیبورد/ },
  cover: { cat: /کیف و کاور|کاور و لوازم جانبی|کاور میکروفون/, accessory: true },
  battery: { cat: /باتری/, accessory: true },
  glass: { cat: /محافظ صفحه نمایش/, accessory: true },
  cable: { cat: /کابل/, accessory: true },
  lcd: { cat: /تاچ و ال سی دی/, accessory: true },
};

type Entry = { alts: string[]; model?: boolean; type?: TypeKey; /** a weak type when the user names none («iphone 15» → a phone) */ implies?: TypeKey };
/** Alias lexicon. Every member pulls in the others; multi-word members match as phrases. */
const LEXICON: Entry[] = [
  // brands
  { alts: ['شیائومی', 'شیاومی', 'xiaomi'] },
  { alts: ['redmi', 'ردمی'] },
  { alts: ['poco', 'پوکو'], implies: 'phone' },
  { alts: ['samsung', 'سامسونگ', 'galaxy', 'گلکسی'] },
  { alts: ['apple', 'اپل'] },
  { alts: ['iphone', 'ایفون'], implies: 'phone' },
  { alts: ['airpods', 'ایرپاد', 'ایربادز', 'airpod'], type: 'audio' },
  { alts: ['jbl', 'جی بی ال'] },
  { alts: ['huawei', 'هواوی'] },
  { alts: ['honor', 'انر', 'آنر'] },
  { alts: ['anker', 'انکر'] },
  { alts: ['soundcore', 'ساندکور'] },
  { alts: ['sony', 'سونی'] },
  { alts: ['lenovo', 'لنوو'] },
  { alts: ['philips', 'فیلیپس'] },
  { alts: ['hikvision', 'هایک ویژن', 'هایکویژن'] },
  { alts: ['dahua', 'داهوا'] },
  { alts: ['baseus', 'باسئوس', 'بیسوس'] },
  { alts: ['logitech', 'لاجیتک', 'لوجیتک'] },
  { alts: ['nokia', 'نوکیا'] },
  { alts: ['motorola', 'موتورولا'] },
  { alts: ['realme', 'ریلمی'] },
  { alts: ['asus', 'ایسوس'] },
  { alts: ['qcy', 'کیو سی وای'] },
  { alts: ['haylou', 'هایلو'] },
  { alts: ['oraimo', 'اورایمو'] },
  { alts: ['ugreen', 'یوگرین'] },
  { alts: ['amazfit', 'امیزفیت'] },
  { alts: ['harman', 'هارمن'] },
  // series / model words (exact, must be in the title)
  { alts: ['pro', 'پرو'], model: true },
  { alts: ['max', 'مکس'], model: true },
  { alts: ['plus', 'پلاس'], model: true },
  { alts: ['ultra', 'اولترا', 'الترا'], model: true },
  { alts: ['lite', 'لایت'], model: true },
  { alts: ['mini', 'مینی'], model: true },
  { alts: ['active', 'اکتیو'], model: true },
  { alts: ['play', 'پلی'], model: true },
  { alts: ['buds', 'بادز'], model: true },
  { alts: ['note', 'نوت'], model: true },
  { alts: ['watch', 'واچ'], model: true },
  { alts: ['flip', 'فلیپ'], model: true },
  // product types
  { alts: ['هندزفری', 'هدفون', 'هدست', 'earbuds', 'headphone', 'headset'], type: 'audio' },
  { alts: ['گوشی', 'موبایل', 'mobile', 'phone'], type: 'phone' },
  { alts: ['اسپیکر', 'بلندگو', 'speaker'], type: 'speaker' },
  { alts: ['شارژر', 'charger', 'اداپتور'], type: 'charger' },
  { alts: ['پاوربانک', 'پاور بانک', 'powerbank'], type: 'powerbank' },
  { alts: ['ساعت هوشمند', 'smartwatch', 'اسمارت واچ'], type: 'watch' },
  { alts: ['لپ تاپ', 'لپتاپ', 'laptop', 'نوت بوک'], type: 'laptop' },
  { alts: ['مداربسته', 'مدار بسته'], type: 'cctv' },
  { alts: ['ماشین اصلاح', 'ریش تراش'], type: 'shaver' },
  { alts: ['ماوس', 'mouse'], type: 'mouse' },
  { alts: ['کیبورد', 'keyboard'], type: 'keyboard' },
  { alts: ['کاور', 'قاب', 'کیف', 'case'], type: 'cover' },
  { alts: ['باتری', 'battery'], type: 'battery' },
  { alts: ['گلس', 'محافظ صفحه', 'glass'], type: 'glass' },
  { alts: ['کابل', 'cable'], type: 'cable' },
  { alts: ['تاچ', 'ال سی دی', 'lcd'], type: 'lcd' },
  // attributes
  { alts: ['بی سیم', 'بیسیم', 'wireless'] },
  { alts: ['تایپ سی', 'type c', 'typec'] },
  { alts: ['وات', 'w', 'watt'] },
];

/** Title words that mark a product as an accessory/part of something else. */
const ACCESSORY_HEAD = new Set(['کاور', 'قاب', 'کیف', 'گلس', 'محافظ', 'باتری', 'تاچ', 'lcd', 'شارژر', 'کابل', 'بند', 'هولدر', 'پایه', 'کیس', 'برچسب', 'قطعه', 'درب', 'فلت', 'برد', 'خشاب']);
const ACCESSORY_CAT = /کیف و کاور|محافظ صفحه|باتری|تاچ و ال سی دی|کاور و لوازم جانبی|کاور میکروفون|قطعات|لوازم یدکی|شارژر|کابل و تبدیل|هولدر|بند ساعت|دوربین گوشی و تبلت|قاب، شاسی و درب|برد و قطعات|فلت و برد گوشی|خشاب سیم کارت|قطعات گوشی|شیشه دوربین گوشی|محافظ لنز دوربین|قطعات و لوازم جانبی تلفن|گوشی و تبلت$/;
/** Variant words that, when in a title but not asked for, mean "a different model". */
const VARIANT = new Set(['pro', 'max', 'plus', 'ultra', 'lite', 'mini', 'active', 'play', 'fe', 'se', 'neo', 'prime', 'پرو', 'مکس', 'پلاس', 'اولترا', 'لایت', 'مینی', 'اکتیو', 'پلی']);

const LATIN = /^[a-z0-9]+$/;
const HAS_DIGIT = /\d/;
const n = (s: string) => normalizeFa(s);

/** Tokens exactly as the FTS5 unicode61 tokenizer sees normalised text. */
export function docTokens(text: string): string[] {
  return n(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

const LEX = LEXICON.map((e) => ({ ...e, norm: e.alts.map((a) => docTokens(a)) }));

function altFor(ts: string[]): Alt {
  if (ts.length > 1) return { kind: 'phrase', ts };
  const t = ts[0];
  return !LATIN.test(t) && t.length >= 4 ? { kind: 'prefix', t } : { kind: 'exact', t };
}

/** Damerau-Levenshtein distance ≤ limit (small strings only). */
function closeTo(a: string, b: string, limit: number): boolean {
  if (Math.abs(a.length - b.length) > limit) return false;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length] <= limit;
}

export function analyzeQuery(text: string): Analysis {
  const toks = docTokens(stripBudget(text)).filter((t) => !STOP.has(t) && (t.length > 1 || HAS_DIGIT.test(t)));
  const groups: Group[] = [];
  for (let i = 0; i < toks.length; ) {
    // longest lexicon phrase starting here (multi-word aliases like «جی بی ال», «تایپ سی», «لپ تاپ»)
    let hit: { e: (typeof LEX)[number]; len: number } | null = null;
    for (const e of LEX)
      for (const ts of e.norm)
        if (ts.length > (hit?.len ?? 0) && ts.every((t, k) => toks[i + k] === t)) hit = { e, len: ts.length };
    if (!hit) {
      // typo of a lexicon word («samsong», «redmy», «ساسمونگ»): single-word members only
      const t = toks[i];
      if (t.length >= 4 && !HAS_DIGIT.test(t)) {
        const e = LEX.find((x) => x.norm.some((ts) => ts.length === 1 && LATIN.test(ts[0]) === LATIN.test(t) && closeTo(t, ts[0], t.length >= 8 ? 2 : 1)));
        if (e) hit = { e, len: 1 };
      }
    }
    if (hit) {
      const raw = toks.slice(i, i + hit.len).join(' ');
      const alts = hit.e.norm.map(altFor);
      if (hit.len === 1 && !hit.e.norm.some((ts) => ts.length === 1 && ts[0] === toks[i])) alts.unshift(altFor([toks[i]]));
      groups.push({ raw, alts, model: !!hit.e.model || (hit.len === 1 && LATIN.test(toks[i]) && !hit.e.type), type: hit.e.type, implies: hit.e.implies });
      i += hit.len;
      continue;
    }
    const t = toks[i];
    const alts: Alt[] = [altFor([t])];
    // glued Latin+number («flip6», «watch7») also matches the split form
    const glued = t.match(/^([a-z]{3,})(\d{1,3})$/);
    if (glued) alts.push({ kind: 'phrase', ts: [glued[1], glued[2]] });
    groups.push({ raw: t, alts, model: LATIN.test(t) || HAS_DIGIT.test(t) });
    i++;
  }
  // split «watch 7» / «20 وات» also matches glued title tokens («Watch7», «20W»)
  for (let k = 0; k + 1 < groups.length; k++) {
    const a = groups[k];
    const b = groups[k + 1];
    if (/^\d{1,3}$/.test(b.raw) && /^[a-z]{3,}$/.test(a.raw)) {
      const g: Alt = { kind: 'exact', t: a.raw + b.raw };
      a.alts.push(g);
      b.alts.push(g);
    }
    if (/^\d+$/.test(a.raw) && b.alts.some((x) => x.kind !== 'phrase' && x.t === 'w')) {
      const g: Alt = { kind: 'exact', t: `${a.raw}w` };
      a.alts.push(g);
      b.alts.push(g);
    }
  }
  const named = groups.map((g) => g.type).filter((x): x is TypeKey => !!x);
  const accessoryAsked = named.some((t) => TYPES[t].accessory) || groups.some((g) => ACCESSORY_HEAD.has(g.raw));
  // «کاور گوشی آیفون»: the accessory is what's wanted, not the phone
  const types = [...new Set(accessoryAsked ? named.filter((t) => TYPES[t].accessory) : named)];
  const implied = types.length || accessoryAsked ? [] : [...new Set(groups.map((g) => g.implies).filter((x): x is TypeKey => !!x))];
  return { groups, types, implied, accessoryAsked };
}

// ---------- matching: FTS5 expression and the identical JS predicate ----------

function quote(t: string) {
  return `"${t.replace(/"/g, '')}"`;
}
function altFts(a: Alt): string {
  return a.kind === 'phrase' ? quote(a.ts.join(' ')) : a.kind === 'prefix' ? `${quote(a.t)}*` : quote(a.t);
}
/** FTS5 MATCH for groups joined with AND (mode 'and') or OR. */
export function ftsExpression(groups: Group[], mode: 'and' | 'or'): string | null {
  if (!groups.length) return null;
  const parts = groups.map((g) => `(${g.alts.map(altFts).join(' OR ')})`);
  return parts.join(mode === 'and' ? ' AND ' : ' OR ');
}

function altIn(a: Alt, toks: string[]): boolean {
  if (a.kind !== 'phrase') return a.kind === 'exact' ? toks.includes(a.t) : toks.some((x) => x.startsWith(a.t));
  for (let i = 0; i + a.ts.length <= toks.length; i++) if (a.ts.every((t, k) => toks[i + k] === t)) return true;
  return false;
}
const groupIn = (g: Group, toks: string[]) => g.alts.some((a) => altIn(a, toks));

/** JS twin of the FTS5 query, over docTokens(title + brand + category). */
export function docMatches(groups: Group[], mode: 'and' | 'or', toks: string[]): boolean {
  return mode === 'and' ? groups.every((g) => groupIn(g, toks)) : groups.some((g) => groupIn(g, toks));
}

/** AND → best "all but one" (typos, extra need words) → OR. `match` runs one boolean query on the source. */
export function retrieve<T>(a: Analysis, match: (groups: Group[], mode: 'and' | 'or') => T[], key: (r: T) => string | number): T[] {
  const g = a.groups;
  if (!g.length) return match([], 'and');
  const all = match(g, 'and');
  if (all.length || g.length === 1) return all.length ? all : match(g, 'or');
  const seen = new Set<string | number>();
  const out: T[] = [];
  for (let i = 0; i < g.length; i++)
    for (const r of match(g.filter((_, k) => k !== i), 'and')) {
      const k = key(r);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(r);
    }
  return out.length ? out : match(g, 'or');
}

// ---------- scoring ----------

export type Scorable = { title: string; brand: string | null; category: string; shopCount: number };

const isAccessory = (p: Scorable, titleToks: string[]) => ACCESSORY_HEAD.has(titleToks[0]) || ACCESSORY_CAT.test(p.category);

/** Does the product look like the kind of thing asked for (type + not an unwanted accessory)? */
export function typeMatches(a: Analysis, p: Scorable): boolean {
  const want = a.types.length ? a.types : a.implied;
  if (want.length && !want.some((t) => TYPES[t].cat.test(p.category))) return false;
  return a.accessoryAsked || !isAccessory(p, docTokens(p.title));
}

/** All model tokens (Latin words, numbers, series words) of the query appear in the title. */
export function modelHit(a: Analysis, p: Scorable): boolean {
  const tt = docTokens(`${p.title} ${p.brand ?? ''}`);
  const models = a.groups.filter((g) => g.model);
  return models.length > 0 && models.every((g) => groupIn(g, tt));
}

export function scoreProduct(a: Analysis, p: Scorable): number {
  const tt = docTokens(`${p.title} ${p.brand ?? ''}`);
  const all = [...tt, ...docTokens(p.category)];
  const g = a.groups;
  const w = (x: Group) => (x.model ? 2 : 1);
  const total = g.reduce((s, x) => s + w(x), 0) || 1;
  const cover = g.reduce((s, x) => s + (groupIn(x, all) ? w(x) : 0), 0) / total;
  const models = g.filter((x) => x.model);
  const missing = models.filter((x) => !groupIn(x, tt)).length;
  let s = 4 * cover - 2.5 * missing + (models.length && !missing ? 3 : 0);
  // the model words in order, contiguous («redmi buds 8 active»)
  if (models.length >= 2) {
    const fits = (start: number) => {
      let i = start;
      for (const m of models) {
        const alt = m.alts.find((x) => (x.kind === 'phrase' ? x.ts.every((t, k) => tt[i + k] === t) : x.kind === 'exact' ? tt[i] === x.t : tt[i]?.startsWith(x.t)));
        if (!alt) return false;
        i += alt.kind === 'phrase' ? alt.ts.length : 1;
      }
      return true;
    };
    if (tt.some((_, i) => fits(i))) s += 1.5;
  }
  // a variant the user didn't ask for («buds 8 lite» for «buds 8 active»)
  if (models.length) s -= 0.7 * tt.filter((t) => VARIANT.has(t) && !g.some((x) => groupIn(x, [t]))).length;
  // Persian titles lead with the product type: «هدفون …» beats «کاور … هدفون»
  if (g.some((x) => x.type && groupIn(x, tt.slice(0, 1)))) s += 1;
  if (!a.accessoryAsked && isAccessory(p, tt)) s -= 4;
  if (a.types.length && !a.types.some((t) => TYPES[t].cat.test(p.category))) s -= 3;
  else if (a.implied.length && !a.implied.some((t) => TYPES[t].cat.test(p.category))) s -= 1.5;
  return s + 0.6 * Math.min(1, Math.log(p.shopCount + 1) / Math.log(40));
}

/** Best first; shop count breaks exact ties. */
export function rankProducts<T>(a: Analysis, rows: T[], get: (r: T) => Scorable): T[] {
  return rows
    .map((r) => ({ r, s: scoreProduct(a, get(r)), c: get(r).shopCount }))
    .sort((x, y) => y.s - x.s || y.c - x.c)
    .map((x) => x.r);
}

/** Candidate cap per boolean query (most-stocked first): deterministic for both sources. */
export const CANDIDATE_CAP = 1500;
