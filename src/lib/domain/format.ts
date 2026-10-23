import { toFaDigits } from './normalize';

export { toFaDigits };

function trimNum(n: number, digits = 1): string {
  const s = n.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  return toFaDigits(s).replace('.', '٫');
}

/** ۵۲٫۵ میلیون تومان · ۸۵۰ هزار تومان · ۱٫۲ میلیارد تومان */
export function formatToman(price: number, opts: { unit?: boolean } = {}): string {
  const unit = opts.unit === false ? '' : ' تومان';
  if (!Number.isFinite(price) || price <= 0) return 'نامشخص';
  if (price >= 1e9) return `${trimNum(price / 1e9, 2)} میلیارد${unit}`;
  if (price >= 1e6) return `${trimNum(price / 1e6, price >= 1e8 ? 0 : 1)} میلیون${unit}`;
  if (price >= 1e3) return `${trimNum(price / 1e3, 0)} هزار${unit}`;
  return `${toFaDigits(Math.round(price))}${unit}`;
}

/** "از ۱۸۴ تا ۲۲۳ میلیون" style range with a shared unit when possible. */
export function formatRange(min: number, max: number): string {
  if (!max || min === max) return formatToman(min);
  const unitOf = (p: number) => (p >= 1e9 ? 1e9 : p >= 1e6 ? 1e6 : p >= 1e3 ? 1e3 : 1);
  const u = unitOf(max);
  if (unitOf(min) === u && u > 1) {
    const name = u === 1e9 ? 'میلیارد' : u === 1e6 ? 'میلیون' : 'هزار';
    const d = u === 1e6 && max < 1e8 ? 1 : 0;
    return `${trimNum(min / u, d)} تا ${trimNum(max / u, d)} ${name}`;
  }
  return `${formatToman(min, { unit: false })} تا ${formatToman(max, { unit: false })}`;
}

export function formatFullToman(price: number): string {
  return `${Math.round(price).toLocaleString('fa-IR')} تومان`;
}

const rtf = typeof Intl !== 'undefined' ? new Intl.RelativeTimeFormat('fa', { numeric: 'always' }) : null;

/** ۶ روز پیش, ۲ دقیقه پیش, ۴ ماه پیش */
export function relativeFa(date: string | number | Date, now: number = Date.now()): string {
  const t = typeof date === 'object' ? date.getTime() : typeof date === 'string' ? Date.parse(date) : date;
  const diff = Math.max(0, now - t) / 1000;
  const fmt = (v: number, u: Intl.RelativeTimeFormatUnit) =>
    rtf ? toFaDigits(rtf.format(-Math.max(1, Math.round(v)), u)) : `${toFaDigits(Math.round(v))} ${u} پیش`;
  if (diff < 45) return 'همین الان';
  if (diff < 3600) return fmt(diff / 60, 'minute');
  if (diff < 86400) return fmt(diff / 3600, 'hour');
  if (diff < 86400 * 30) return fmt(diff / 86400, 'day');
  if (diff < 86400 * 365) return fmt(diff / (86400 * 30), 'month');
  return fmt(diff / (86400 * 365), 'year');
}

export function formatDistance(m: number): string {
  if (m < 950) return `${toFaDigits(Math.max(10, Math.round(m / 10) * 10))} متر`;
  return `${trimNum(m / 1000, 1)} کیلومتر`;
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${toFaDigits(Math.max(1, Math.round(min)))} دقیقه`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${toFaDigits(h)} ساعت و ${toFaDigits(m)} دقیقه` : `${toFaDigits(h)} ساعت`;
}

export function formatPercent(x: number): string {
  return `${toFaDigits(Math.round(x * 100))}٪`;
}

export function floorLabel(floor: number | null): string | null {
  if (floor === null || floor === undefined) return null;
  if (floor === 0) return 'همکف';
  if (floor === 0.5) return 'نیم‌طبقه';
  if (floor < 0) return `زیرهمکف ${toFaDigits(-floor)}`;
  if (floor % 1) return `نیم‌طبقه ${toFaDigits(Math.floor(floor))}`;
  return `طبقه ${toFaDigits(floor)}`;
}
