'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Info, MapPin } from 'lucide-react';
import { useMapStore } from '@/lib/store/map';
import { useShops } from '@/lib/store/shops';
import { cn } from '@/lib/cn';
import { floorLabel, formatToman, toFaDigits } from '@/lib/domain/format';
import { Button } from './ui/button';
import { HoursBadge } from './Badges';
import { ThinkingDots } from './Mascot';

export function FloorChips() {
  const mall = useMapStore((s) => s.mall);
  const patch = useMapStore((s) => s.patchMall);
  if (!mall?.floors?.length) return null;
  const target = mall.cubes?.find((c) => c.role === 'target');
  return (
    <div className="no-scrollbar flex gap-1.5 overflow-x-auto" role="tablist" aria-label="طبقه‌ها" data-testid="floor-chips">
      <button
        role="tab"
        aria-selected={mall.isolate === null}
        onClick={() => patch({ isolate: null })}
        className={cn('h-9 shrink-0 rounded-full px-3 text-[13px]', mall.isolate === null ? 'bg-ink text-white' : 'bg-canvas/95 text-ink-2 shadow-soft')}
      >
        همه
      </button>
      {mall.floors.map((f) => (
        <button
          key={f}
          role="tab"
          aria-selected={mall.isolate === f}
          onClick={() => patch({ isolate: f })}
          className={cn(
            'relative h-9 min-w-9 shrink-0 rounded-full px-3 text-[13px]',
            mall.isolate === f ? 'bg-ink text-white' : 'bg-canvas/95 text-ink-2 shadow-soft',
          )}
          data-testid="floor-chip"
        >
          {f === 0 ? 'همکف' : f < 0 ? `منفی ${toFaDigits(-f)}` : toFaDigits(f)}
          {target?.floor === f && <span className="absolute -top-0.5 end-0 size-2.5 rounded-full border-2 border-white bg-accent" />}
        </button>
      ))}
    </div>
  );
}

export function MallOverlay({ onExit, onOpenShop }: { onExit: () => void; onOpenShop: (shopId: string) => void }) {
  const mall = useMapStore((s) => s.mall);
  const offers = useShops((s) => s.offers);
  if (!mall) return null;
  const picked = mall.picked;
  const pickedOffer = picked ? offers.find((o) => o.shopId === picked.id) : null;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-3 pt-[max(12px,env(safe-area-inset-top))]" data-testid="mall-overlay">
      <div className="pointer-events-auto space-y-2">
        <div className="flex items-center gap-2">
          <Button variant="dark" size="md" onClick={onExit} className="shadow-pop" data-testid="mall-exit">
            <ArrowRight className="size-4" />
            بازگشت به نقشه
          </Button>
          <div className="min-w-0 rounded-full bg-canvas/95 px-3 py-2 text-[13px] font-semibold shadow-soft">
            <span className="truncate">{mall.complexName}</span>
          </div>
        </div>
        <FloorChips />
        <p className="inline-flex items-center gap-1.5 rounded-full bg-canvas/90 px-3 py-1.5 text-[12px] text-ink-2 shadow-soft">
          <Info className="size-3.5" />
          نقشه شماتیک — طبقه و واحد واقعی، جانمایی تقریبی
        </p>
        {mall.status === 'loading' && (
          <div className="inline-flex items-center gap-2 rounded-full bg-canvas px-3 py-1.5 text-[13px] shadow-soft">
            در حال ساختن نمای پاساژ <ThinkingDots />
          </div>
        )}
        {mall.status === 'error' && <div className="rounded-xl bg-canvas p-3 text-[13px] shadow-soft">نمای این پاساژ بارگیری نشد.</div>}
      </div>
      <div className="pointer-events-auto space-y-2">
        <div className="flex flex-wrap items-center gap-3 rounded-full bg-canvas/95 px-3 py-1.5 text-[12px] shadow-soft">
          <Legend color="bg-accent" label="فروشگاه انتخابی" />
          <Legend color="bg-[#6b7280]" label="این کالا را دارد" />
          <Legend color="bg-[#9aa0aa]/40" label="سایر واحدها" />
          <span className="inline-flex items-center gap-1 text-info">
            <MapPin className="size-3.5" />
            ورودی: سمت خیابان (تقریبی)
          </span>
        </div>
        <AnimatePresence>
          {picked && (
            <motion.div
              key={picked.id}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="rounded-2xl bg-canvas p-3 shadow-pop"
              data-testid="mall-picked"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{picked.name}</div>
                  <div className="text-[12.5px] text-ink-2">
                    {[floorLabel(picked.floor), picked.unit ? `واحد ${toFaDigits(picked.unit)}` : null].filter(Boolean).join(' · ') || 'طبقه و واحد ثبت نشده'}
                  </div>
                  <HoursBadge hours={picked.hours} />
                </div>
                {pickedOffer ? (
                  <div className="text-end">
                    <div className="font-bold">{formatToman(pickedOffer.price)}</div>
                    <Button size="sm" variant="soft" className="mt-1" onClick={() => onOpenShop(picked.id)}>
                      جزئیات
                    </Button>
                  </div>
                ) : (
                  <span className="text-[12px] text-muted">این کالا را ثبت نکرده</span>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn('size-2.5 rounded-sm', color)} />
      {label}
    </span>
  );
}
