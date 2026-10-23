'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { DoorOpen, RotateCcw, SearchX, Footprints, Car } from 'lucide-react';
import { useRankedOffers, useShops } from '@/lib/store/shops';
import { cn } from '@/lib/cn';
import type { SortKey } from '@/lib/domain/ranking';
import { formatDistance, formatMinutes, toFaDigits } from '@/lib/domain/format';
import { ShopCard, ShopCardSkeleton } from './ShopCard';
import { AgentNotices } from './AgentNotice';
import { LocationChip, LocationExplainer } from './LocationControl';
import { Button } from './ui/button';
import { Approx, HoursBadge } from './Badges';
import { useIsDesktop } from '@/lib/useMedia';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'best', label: 'پیشنهاد ما' },
  { key: 'nearest', label: 'نزدیک‌ترین' },
  { key: 'cheapest', label: 'ارزان‌ترین' },
  { key: 'verified', label: 'تأیید شده' },
];

export function SortChips() {
  const sort = useShops((s) => s.sort);
  const setSort = useShops((s) => s.setSort);
  return (
    <div className="no-scrollbar flex gap-1.5 overflow-x-auto" role="tablist" aria-label="مرتب‌سازی">
      {SORTS.map((s) => (
        <button
          key={s.key}
          role="tab"
          aria-selected={sort === s.key}
          onClick={() => setSort(s.key)}
          className={cn(
            'h-9 shrink-0 rounded-full px-3.5 text-[13.5px] transition-colors',
            sort === s.key ? 'bg-ink text-white' : 'bg-surface text-ink-2 hover:bg-surface-2',
          )}
          data-testid={`sort-${s.key}`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

export function ShopsPanel({ onOpenShop, peekShopId }: { onOpenShop: (shopId: string) => void; peekShopId?: string | null }) {
  const { all, visible, relaxation } = useRankedOffers();
  const status = useShops((s) => s.status);
  const error = useShops((s) => s.error);
  const sort = useShops((s) => s.sort);
  const inquiries = useShops((s) => s.inquiries);
  const overrides = useShops((s) => s.overrides);
  const highlight = useShops((s) => s.highlight);
  const setHighlight = useShops((s) => s.setHighlight);
  const closedFlow = useShops((s) => s.closedFlow);
  const setClosedFlow = useShops((s) => s.setClosedFlow);
  const productId = useShops((s) => s.productId);
  const load = useShops((s) => s.load);
  const desktop = useIsDesktop();
  const listRef = useRef<HTMLDivElement>(null);

  // pin tap → scroll its card into view
  useEffect(() => {
    if (!highlight || highlight.by !== 'pin') return;
    const el = listRef.current?.querySelector(`[data-shop-id="${highlight.shopId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [highlight]);

  const peek = peekShopId ? visible.find((o) => o.shopId === peekShopId) : null;

  if (closedFlow) {
    const alternatives = all
      .filter((o) => o.shopId !== closedFlow && o.open === true && !o.outOfStock)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, 3);
    return (
      <div className="space-y-3" data-testid="closed-flow">
        <AgentNotices onOpenShop={onOpenShop} />
        <div className="rounded-2xl bg-warn-wash p-3 text-[14px] leading-7 text-ink">
          <DoorOpen className="me-1 inline size-4 text-warn" />
          متأسفیم! نزدیک‌ترین فروشگاه‌های باز با همین کالا:
        </div>
        {alternatives.length ? (
          alternatives.map((o, i) => (
            <motion.button
              key={o.shopId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              onClick={() => {
                setClosedFlow(null);
                onOpenShop(o.shopId);
              }}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-canvas p-3 text-start hover:shadow-soft"
              data-testid="closed-alt"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ok-wash font-bold text-ok">{toFaDigits(i + 1)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{o.shop.name}</span>
                <span className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-2">
                  <HoursBadge hours={o.shop.hours} />
                  <span className="inline-flex items-center gap-1">
                    <Footprints className="size-3.5" />
                    {formatMinutes(o.walkMin)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Car className="size-3.5" />
                    {formatMinutes(o.carMin)}
                  </span>
                  <span>{formatDistance(o.distanceM)}</span>
                  <Approx />
                </span>
              </span>
            </motion.button>
          ))
        ) : (
          <p className="rounded-2xl border border-dashed border-line-strong p-3 text-[14px] text-ink-2">
            الان فروشگاه بازِ دیگری با ساعت کاری ثبت‌شده پیدا نشد. فهرست کامل را ببین؛ بعضی فروشگاه‌ها ساعت کاری ثبت نکرده‌اند.
          </p>
        )}
        <Button variant="outline" className="w-full" onClick={() => setClosedFlow(null)}>
          نمایش همه‌ی فروشگاه‌ها
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <LocationExplainer />
      <AgentNotices onOpenShop={onOpenShop} />
      {peek && !desktop && (
        <ShopCard o={peek} inq={inquiries[peek.shopId]} override={overrides[peek.shopId]} showReason highlighted onOpen={() => onOpenShop(peek.shopId)} />
      )}
      <div className="flex items-center justify-between gap-2">
        <LocationChip />
        {status === 'ready' && (
          <span className="shrink-0 text-[12.5px] text-muted" data-testid="shop-count">
            {toFaDigits(visible.length)} فروشگاه
          </span>
        )}
      </div>
      <SortChips />
      <div ref={listRef} className="space-y-2.5 pb-6" data-testid="shop-list">
        {status === 'loading' && !all.length && [0, 1, 2, 3].map((i) => <ShopCardSkeleton key={i} />)}
        {status === 'error' && (
          <div className="rounded-2xl border border-[#f6d0d0] bg-[#fff6f6] p-3 text-[14px]">
            فهرست فروشگاه‌ها نرسید ({error}).
            <Button size="sm" variant="outline" className="ms-2" onClick={() => {
                if (!productId) return;
                useShops.setState({ status: 'idle' });
                void load(productId);
              }}>
              <RotateCcw className="size-4" />
              دوباره
            </Button>
          </div>
        )}
        {status === 'ready' && !visible.length && (
          <div className="rounded-2xl border border-dashed border-line-strong bg-surface p-4 text-center" data-testid="relaxation">
            <SearchX className="mx-auto mb-1 size-6 text-muted" />
            <p className="text-[14.5px] font-semibold">با این شرایط فروشگاهی پیدا نشد</p>
            {relaxation && (
              <>
                <p className="mt-1 text-[13.5px] leading-6 text-ink-2">{relaxation.text}</p>
                <Button size="sm" className="mt-3" onClick={relaxation.apply} data-testid="relax-apply">
                  {relaxation.label}
                </Button>
              </>
            )}
          </div>
        )}
        <AnimatePresence initial={false}>
          {visible.map((o) => (
            <ShopCard
              key={o.shopId}
              o={o}
              inq={inquiries[o.shopId]}
              override={overrides[o.shopId]}
              showReason={sort === 'best'}
              highlighted={highlight?.shopId === o.shopId}
              onOpen={() => onOpenShop(o.shopId)}
              onHover={desktop ? (on) => setHighlight(on ? o.shopId : null, 'card') : undefined}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
