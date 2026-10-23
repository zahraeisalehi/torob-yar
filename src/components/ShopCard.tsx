'use client';
import { motion } from 'framer-motion';
import { Footprints, Building2, ShieldCheck, CreditCard, BadgeCheck, Sparkles } from 'lucide-react';
import type { RankedOffer } from '@/lib/domain/ranking';
import { cn } from '@/lib/cn';
import { faText, floorLabel, formatDistance, formatMinutes, formatToman, toFaDigits } from '@/lib/domain/format';
import { ageDays } from '@/lib/domain/freshness';
import type { InquiryDTO } from '@/lib/inquiries/types';
import { FreshnessBadge, HoursBadge, StockBadge, type StockState, Approx } from './Badges';
import type { HoursOverride } from '@/lib/domain/hours';

export function stockOf(o: RankedOffer, inq?: InquiryDTO): StockState {
  if (o.outOfStock) return 'out';
  if (o.verified) return 'verified';
  if (inq && inq.status !== 'replied') return 'listed';
  return 'listed';
}

export function AddressLine({ o, large }: { o: RankedOffer | { shop: RankedOffer['shop'] }; large?: boolean }) {
  const s = o.shop;
  const parts = [s.complex?.name, floorLabel(s.floor), s.unit ? `واحد ${toFaDigits(s.unit)}` : null].filter(Boolean) as string[];
  if (!parts.length) return <p className={cn('line-clamp-1 text-[12.5px] text-muted', large && 'text-sm')}>{toFaDigits(s.address)}</p>;
  return (
    <p className={cn('flex flex-wrap items-center gap-x-1 text-[12.5px] text-ink-2', large && 'text-sm')}>
      <Building2 className="size-3.5 shrink-0 text-muted" />
      {parts.map((p, i) => (
        <span key={i} className="font-semibold text-ink">
          {p}
          {i < parts.length - 1 && <span className="font-normal text-faint">، </span>}
        </span>
      ))}
    </p>
  );
}

export function ShopCard({
  o,
  inq,
  override,
  showReason,
  highlighted,
  onOpen,
  onHover,
  compact,
}: {
  o: RankedOffer;
  inq?: InquiryDTO;
  override?: HoursOverride;
  showReason?: boolean;
  highlighted?: boolean;
  onOpen: () => void;
  onHover?: (on: boolean) => void;
  compact?: boolean;
}) {
  const priceChanged = o.effectivePrice !== o.price;
  const outdated = inq && (inq.status === 'sent' || inq.status === 'seen') && (o.fresh === 'checking') && ageDays(o.lastChangedAt) > 7;
  return (
    <motion.article
      layout="position"
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: o.outOfStock ? 0.55 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}
      className={cn(
        'cursor-pointer rounded-[20px] border bg-canvas p-3.5 transition-[border-color,box-shadow] hover:shadow-soft',
        o.verified ? 'border-ok/40 bg-gradient-to-b from-ok-wash/60 to-canvas' : 'border-line',
        highlighted && 'border-accent shadow-[0_0_0_3px_var(--accent-wash)]',
      )}
      data-testid="shop-card"
      data-shop-id={o.shopId}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-[15px] font-semibold text-ink">{o.shop.name}</h3>
            {o.verified && <BadgeCheck className="size-4 shrink-0 text-ok" aria-label="تأیید شده" />}
            <span className="shrink-0 text-[12px] text-muted">· {o.shop.locationLabel}</span>
          </div>
          <AddressLine o={o} />
        </div>
        <div className="shrink-0 text-end">
          {priceChanged && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[12px] text-muted line-through">
              {formatToman(o.price, { unit: false })}
            </motion.div>
          )}
          <motion.div key={o.effectivePrice} initial={priceChanged ? { scale: 1.15, color: '#16a34a' } : false} animate={{ scale: 1, color: '#1f2430' }} className="text-[16px] font-bold">
            {formatToman(o.effectivePrice, { unit: false })}
          </motion.div>
          <div className="text-[11px] text-muted">تومان</div>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <FreshnessBadge state={o.fresh} at={o.verified && inq?.repliedAt ? inq.repliedAt : o.lastChangedAt} compact={compact} />
        <StockBadge state={stockOf(o, inq)} />
        <HoursBadge hours={o.shop.hours} override={override} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-2">
        <span className="inline-flex items-center gap-1">
          <Footprints className="size-3.5 text-muted" />
          {formatDistance(o.distanceM)} · {formatMinutes(o.walkMin)} پیاده
          <Approx />
        </span>
        {o.shop.installment && (
          <span className="inline-flex items-center gap-1 text-accent-strong">
            <CreditCard className="size-3.5" />
            اقساطی: {o.shop.providers.filter((p) => p !== 'ترب‌پی').join('، ')}
          </span>
        )}
        {o.shop.torobPay && <span className="rounded-full bg-accent-wash px-2 text-[11.5px] text-accent-strong">ترب‌پی حضوری</span>}
        {o.warranty && (
          <span className="inline-flex min-w-0 items-center gap-1">
            <ShieldCheck className="size-3.5 shrink-0 text-muted" />
            <span className="line-clamp-1">{faText(o.warranty)}</span>
          </span>
        )}
      </div>

      {outdated && (
        <p className="mt-2 rounded-xl bg-info-wash px-3 py-1.5 text-[12.5px] text-info">
          قیمت این فروشگاه {toFaDigits(ageDays(o.lastChangedAt))} روز پیش ثبت شده؛ داریم از فروشنده می‌پرسیم
        </p>
      )}
      {showReason && o.reason && (
        <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-accent-strong" data-testid="reason">
          <Sparkles className="size-3.5" />
          {o.reason}
        </p>
      )}
    </motion.article>
  );
}

export function ShopCardSkeleton() {
  return (
    <div className="space-y-3 rounded-[20px] border border-line p-3.5">
      <div className="flex justify-between">
        <div className="skeleton h-4 w-2/5 rounded-full" />
        <div className="skeleton h-5 w-16 rounded-full" />
      </div>
      <div className="skeleton h-3 w-3/5 rounded-full" />
      <div className="flex gap-2">
        <div className="skeleton h-5 w-24 rounded-full" />
        <div className="skeleton h-5 w-20 rounded-full" />
      </div>
    </div>
  );
}
