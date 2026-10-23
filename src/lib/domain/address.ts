import { normalizeBasic } from './normalize';

export type ParsedAddress = {
  complex: string | null;
  floor: number | null;
  unit: string | null;
  confidence: 'high' | 'medium' | 'low';
};

const ORDINALS: Record<string, number> = {
  اول: 1,
  یکم: 1,
  دوم: 2,
  سوم: 3,
  چهارم: 4,
  پنجم: 5,
  ششم: 6,
  هفتم: 7,
  هشتم: 8,
  نهم: 9,
  دهم: 10,
};
const CARDINALS: Record<string, number> = { یک: 1, دو: 2, سه: 3, چهار: 4, پنج: 5 };

const COMPLEX_RE = /(پاساژ|مجتمع(?: تجاری)?|مرکز خرید|مرکز تجارت|بازار|ساختمان)\s+([^،,()]+)/;

function cleanComplexName(kind: string, rest: string): string {
  let name = rest
    .replace(/\s*(طبقه|واحد|پلاک|غرفه|زیرزمین|زیر همکف|زیرهمکف|همکف).*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  // "علاالدین 2" / "علاالدین ۲" are the same building family in the data; keep the number though.
  name = name.replace(/\s+$/, '');
  const k = kind.startsWith('مجتمع') ? 'مجتمع' : kind;
  return `${k} ${name}`.trim();
}

function parseFloor(a: string): number | null {
  if (/نیم\s*طبقه/.test(a)) {
    const base = a.match(/نیم\s*طبقه\s*(اول|دوم|سوم|\d+)?/);
    const n = base?.[1] ? (ORDINALS[base[1]] ?? Number(base[1])) : 0;
    return n + 0.5;
  }
  if (/طبقه\s*(بالای|بالا)\s*همکف/.test(a)) return 1;
  if (/(زیر\s*همکف|زیرزمین|طبقه\s*زیرین)/.test(a)) {
    const m = a.match(/(زیرزمین|زیر\s*همکف)\s*(اول|دوم|سوم|\d+)/);
    if (m) return -(ORDINALS[m[2]] ?? Number(m[2]));
    return -1;
  }
  const neg = a.match(/(?:طبقه\s*)?منفی\s*(\d+|یک|دو|سه)/);
  if (neg) return -(CARDINALS[neg[1]] ?? Number(neg[1]));
  const m = a.match(/طبقه\s*(اول|یکم|دوم|سوم|چهارم|پنجم|ششم|هفتم|هشتم|نهم|دهم|\d+)/);
  if (m) {
    const v = ORDINALS[m[1]] ?? Number(m[1]);
    if (Number.isFinite(v)) return v;
  }
  if (/همکف/.test(a)) return 0;
  return null;
}

function parseUnit(a: string, complexIdx: number): string | null {
  // Prefer explicit unit/booth; fall back to plaque only when it appears after the complex name.
  const unitRe = /(واحد|غرفه)\s*([A-Za-z]?\s?\d+[A-Za-z]?(?:\/\d+)?)/;
  const u = a.match(unitRe);
  if (u) return u[2].replace(/\s+/g, '');
  const plaqueRe = /پلاک\s*([A-Za-z]?\d+[A-Za-z]?(?:\/\d+)?)/g;
  let m: RegExpExecArray | null;
  let last: string | null = null;
  while ((m = plaqueRe.exec(a))) {
    if (complexIdx >= 0 ? m.index > complexIdx : false) return m[1];
    last = m[1];
  }
  // No complex: a plaque is just a street number, keep it as the unit only if a floor exists too.
  if (complexIdx < 0 && last && /طبقه|همکف/.test(a)) return last;
  return null;
}

export function parseAddress(raw: string | null | undefined): ParsedAddress {
  if (!raw) return { complex: null, floor: null, unit: null, confidence: 'low' };
  const a = normalizeBasic(raw).replace(/‌/g, ' ');
  const cm = a.match(COMPLEX_RE);
  let complex: string | null = null;
  let complexIdx = -1;
  if (cm && cm.index !== undefined) {
    const name = cleanComplexName(cm[1], cm[2]);
    // Reject "روبروی پاساژ X" style references when a later complex exists.
    const all = [...a.matchAll(new RegExp(COMPLEX_RE.source, 'g'))];
    const pick =
      all.find((x) => {
        const before = a.slice(Math.max(0, (x.index ?? 0) - 8), x.index);
        return !/(روبروی|روبه‌روی|روبه روی|جنب|کنار|پشت)\s*$/.test(before);
      }) ?? all[0];
    complex = cleanComplexName(pick[1], pick[2]);
    complexIdx = pick.index ?? -1;
    if (name.split(' ').length < 2) complex = null;
    if (complex && complex.length > 40) complex = complex.slice(0, 40).trim();
    if (complex && /^\S+\s*$/.test(complex)) complex = null;
  }
  const floor = parseFloor(a);
  const unit = parseUnit(a, complexIdx);
  const hits = [complex, floor, unit].filter((x) => x !== null && x !== undefined).length;
  return {
    complex,
    floor,
    unit,
    confidence: hits === 3 ? 'high' : hits === 2 ? 'medium' : 'low',
  };
}

/** Canonical key for grouping complexes: "پاساژ علاالدین 2" and "مجتمع علاالدین ۲" → same key. */
export function complexKey(name: string): string {
  return normalizeBasic(name)
    .replace(/^(پاساژ|مجتمع|مرکز خرید|مرکز تجارت|بازار|ساختمان)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}
