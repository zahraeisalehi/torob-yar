import { relativeFa } from './format';

export type FreshState = 'verified' | 'recent' | 'aging' | 'stale' | 'checking';
const DAY = 86_400_000;

export function freshnessOf(lastChangedAt: string, now: number = Date.now()): Exclude<FreshState, 'verified' | 'checking'> {
  const age = now - Date.parse(lastChangedAt);
  if (age <= 7 * DAY) return 'recent';
  if (age <= 30 * DAY) return 'aging';
  return 'stale';
}

export function ageDays(lastChangedAt: string, now: number = Date.now()): number {
  return Math.floor((now - Date.parse(lastChangedAt)) / DAY);
}

export function freshnessText(state: FreshState, at?: string | number, now: number = Date.now()): string {
  const rel = at !== undefined ? relativeFa(at, now) : '';
  switch (state) {
    case 'verified':
      return `تأیید شده · ${rel}`;
    case 'recent':
      return `ثبت‌شده · ${rel}`;
    case 'aging':
      return `ممکن است تغییر کرده باشد · ${rel}`;
    case 'stale':
      return `قیمت قدیمی · ${rel}`;
    case 'checking':
      return 'در حال استعلام از فروشنده…';
  }
}
