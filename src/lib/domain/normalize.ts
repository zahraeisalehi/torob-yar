// Persian text normalisation shared by the build scripts, the FTS index and query time.

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function toAsciiDigits(s: string): string {
  return s.replace(/[۰-۹٠-٩]/g, (d) => {
    const i = FA_DIGITS.indexOf(d);
    return String(i >= 0 ? i : AR_DIGITS.indexOf(d));
  });
}

export function toFaDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

/** DATA.md §3 normalisation, without touching ZWNJ (address parsing keeps word shapes). */
export function normalizeBasic(s: string): string {
  return toAsciiDigits(s)
    .replace(/ي/g, 'ی')
    .replace(/ى/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ة/g, 'ه')
    .replace(/[ًٌٍَُِّْ]/g, '')
    .replace(/علاءالدین/g, 'علاالدین')
    .replace(/علالدین/g, 'علاالدین')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** Full search normalisation: basic + ZWNJ → space + lowercase Latin + strip punctuation. */
export function normalizeFa(s: string): string {
  return normalizeBasic(s)
    .replace(/[‌‏‎]/g, ' ')
    .replace(/[آأإ]/g, 'ا')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.+/-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tokens for FTS queries. */
export function tokenize(s: string): string[] {
  return normalizeFa(s)
    .split(/[\s/]+/)
    .map((t) => t.replace(/^[.+-]+|[.+-]+$/g, ''))
    .filter((t) => t.length > 0);
}
