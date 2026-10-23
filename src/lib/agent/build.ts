import type { Product } from '../data/types';
import type { SearchFilters, SpecDiffRow } from './blocks';
import { normalizeFa, toAsciiDigits } from '../domain/normalize';
import { formatPercent, formatToman, toFaDigits } from '../domain/format';

export function freshLabel(p: Product): string {
  return `قیمت‌ها: ${formatPercent(p.freshShare)} این هفته`;
}

export function applyFilters(products: Product[], f: SearchFilters): Product[] {
  return products.filter((p) => {
    if (f.maxPrice && p.minPrice > f.maxPrice) return false;
    if (f.minPrice && p.maxPrice < f.minPrice) return false;
    const text = ' ' + normalizeFa(`${p.title} ${p.brand ?? ''} ${p.keySpecs.map((s) => s.value).join(' ')}`) + ' ';
    if (f.brand && !text.includes(normalizeFa(f.brand))) return false;
    if (f.include?.length && !f.include.some((w) => text.includes(normalizeFa(w)))) return false;
    if (f.exclude?.length && f.exclude.some((w) => text.includes(normalizeFa(w)))) return false;
    return true;
  });
}

/** Model family key so we don't show 3 storage variants of the same phone. */
function familyKey(p: Product): string {
  return normalizeFa(p.title.split('|')[0])
    .replace(/\((ویتنام|چین|هند)\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Deterministic pick: popular + fresh, one per model family. */
export function defaultPick(products: Product[], n = 3): Product[] {
  const sorted = [...products].sort((a, b) => b.shopCount * (0.5 + b.freshShare) - a.shopCount * (0.5 + a.freshShare));
  const out: Product[] = [];
  const fams = new Set<string>();
  for (const p of sorted) {
    const k = familyKey(p);
    if (fams.has(k)) continue;
    fams.add(k);
    out.push(p);
    if (out.length >= n) break;
  }
  for (const p of sorted) if (out.length < Math.min(2, sorted.length) && !out.includes(p)) out.push(p);
  return out;
}

const HIGHER = /حافظه|رم|باتری|دوربین|توان|ظرفیت|نرخ|بلوتوث|ماندگاری|عمر|روشنایی|سرعت شارژ|تعداد درگاه|مدت/;
const LOWER = /وزن/;

function num(v: string | null): number | null {
  if (!v) return null;
  const m = toAsciiDigits(v).match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

export function buildSpecDiff(products: Product[], preferKeys: string[] = []): SpecDiffRow[] {
  const keys: string[] = [];
  for (const k of [...preferKeys, ...products.flatMap((p) => p.keySpecs.map((s) => s.key))]) if (!keys.includes(k)) keys.push(k);
  const rows: SpecDiffRow[] = [];
  for (const key of keys) {
    const values = products.map((p) => p.keySpecs.find((s) => s.key === key)?.value ?? null);
    const present = values.filter((v) => v !== null);
    if (present.length < 2) continue;
    if (new Set(present.map((v) => normalizeFa(v!))).size < 2) continue;
    let bestIndex: number | null = null;
    const dir = HIGHER.test(key) ? 1 : LOWER.test(key) ? -1 : 0;
    if (dir) {
      const nums = values.map(num);
      const valid = nums.map((n, i) => ({ n, i })).filter((x) => x.n !== null) as { n: number; i: number }[];
      if (valid.length >= 2) {
        const best = valid.reduce((a, b) => (dir * b.n > dir * a.n ? b : a));
        if (valid.filter((x) => x.n === best.n).length === 1) bestIndex = best.i;
      }
    }
    rows.push({ key, values: values.map((v) => (v ? toFaDigits(v) : v)), bestIndex });
    if (rows.length >= 6) break;
  }
  // price row always helps the comparison
  rows.unshift({
    key: 'کمترین قیمت',
    values: products.map((p) => formatToman(p.minPrice)),
    bestIndex: products.reduce((bi, p, i, arr) => (p.minPrice < arr[bi].minPrice ? i : bi), 0),
  });
  return rows;
}

/** Template "why" when there's no LLM: ties the user's stated needs to concrete facts. */
export function templateWhy(p: Product, needs: string[], all: Product[]): string {
  const facts: string[] = [];
  const cheapest = all.every((o) => o.minPrice >= p.minPrice);
  const widest = all.every((o) => o.shopCount <= p.shopCount);
  const spec = p.keySpecs.slice(0, 2).map((s) => `${s.key} ${s.value}`);
  if (cheapest) facts.push('ارزان‌ترین گزینه‌ی این جمع');
  if (widest) facts.push(`در ${toFaDigits(p.shopCount)} فروشگاه موجوده و راحت پیدا می‌شه`);
  if (!facts.length && spec.length) facts.push(toFaDigits(spec.join('، ')));
  if (!facts.length) facts.push(`از ${formatToman(p.minPrice)} در ${toFaDigits(p.shopCount)} فروشگاه`);
  const need = needs.filter(Boolean).at(-1);
  return need ? `برای ${need} مناسبه؛ ${facts.join(' و ')}.` : `${facts.join(' و ')}.`;
}
