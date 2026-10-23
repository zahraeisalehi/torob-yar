'use client';
import { Check, Clock, PackageCheck, PackageX, HelpCircle, Package } from 'lucide-react';
import { cn } from '@/lib/cn';
import { freshnessText, type FreshState } from '@/lib/domain/freshness';
import { todayLabel, type HoursOverride } from '@/lib/domain/hours';
import type { WeeklyHours } from '@/lib/data/types';

const FRESH_STYLE: Record<FreshState, string> = {
  verified: 'bg-ok-wash text-ok',
  recent: 'bg-surface-2 text-ink-2',
  aging: 'bg-warn-wash text-warn',
  stale: 'bg-stale-wash text-stale',
  checking: 'bg-info-wash text-info',
};

export function FreshnessBadge({
  state,
  at,
  className,
  compact,
}: {
  state: FreshState;
  at?: string | number | null;
  className?: string;
  compact?: boolean;
}) {
  const text = freshnessText(state, at ?? undefined);
  return (
    <span
      className={cn('inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[12px] leading-5', FRESH_STYLE[state], className)}
      title={text}
    >
      {state === 'verified' && <Check className="size-3.5 shrink-0" strokeWidth={3} />}
      {state === 'checking' && <span className="size-2 shrink-0 rounded-full bg-info animate-pulse-dot" />}
      {state === 'aging' && <Clock className="size-3.5 shrink-0" />}
      <span className={cn('truncate', state === 'stale' && 'decoration-stale/60')}>
        {compact && state !== 'checking' ? text.split(' · ')[0] : text}
      </span>
    </span>
  );
}

export type StockState = 'unknown' | 'listed' | 'verified' | 'out';
const STOCK: Record<StockState, { text: string; cls: string; Icon: typeof Package }> = {
  unknown: { text: 'موجودی: نامشخص', cls: 'text-muted', Icon: HelpCircle },
  listed: { text: 'موجودی: در لیست فروشنده', cls: 'text-ink-2', Icon: Package },
  verified: { text: 'موجودی: تأیید شده', cls: 'text-ok', Icon: PackageCheck },
  out: { text: 'ناموجود', cls: 'text-danger', Icon: PackageX },
};

export function StockBadge({ state, className }: { state: StockState; className?: string }) {
  const s = STOCK[state];
  return (
    <span className={cn('inline-flex items-center gap-1 text-[12px]', s.cls, className)}>
      <s.Icon className="size-3.5" />
      {s.text}
    </span>
  );
}

export function HoursBadge({ hours, override, className }: { hours: WeeklyHours | null; override?: HoursOverride; className?: string }) {
  const t = todayLabel(hours, override);
  const text = t.tone === 'unknown' ? 'ساعات کاری ثبت نشده' : t.text;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[12px]',
        t.tone === 'open' ? 'text-ok' : t.tone === 'closed' ? 'text-danger' : 'text-muted',
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', t.tone === 'open' ? 'bg-ok' : t.tone === 'closed' ? 'bg-danger' : 'bg-faint')} />
      {text}
    </span>
  );
}

export function Approx({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center rounded-full bg-surface-2 px-1.5 text-[11px] text-muted', className)}
      title="محاسبه تقریبی — مسیریابی دقیق به‌زودی"
    >
      تقریبی
    </span>
  );
}
