'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, Wallet, Ruler, CreditCard, DoorOpen, X, Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useCriteria } from '@/lib/store/criteria';
import { formatToman, toFaDigits } from '@/lib/domain/format';
import { Button } from './ui/button';
import { useIsDesktop } from '@/lib/useMedia';

const DISTANCES: { km: number | null; label: string }[] = [
  { km: 0.5, label: '۵۰۰ متر' },
  { km: 1, label: '۱ کیلومتر' },
  { km: 3, label: '۳ کیلومتر' },
  { km: 5, label: '۵ کیلومتر' },
  { km: null, label: 'همه' },
];

function CritChip({
  active,
  onClick,
  children,
  icon: Icon,
  caret,
  testId,
  chipRef,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon: typeof Wallet;
  caret?: boolean;
  testId: string;
  chipRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={chipRef}
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] transition-colors',
        active ? 'border-accent bg-accent-wash text-accent-strong' : 'border-line bg-canvas text-ink-2 hover:bg-surface',
      )}
      data-testid={testId}
    >
      <Icon className="size-4" />
      {children}
      {caret && <ChevronDown className="size-3.5 opacity-60" />}
    </button>
  );
}

export function CriteriaBar({ bounds, className }: { bounds: { min: number; max: number } | null; className?: string }) {
  const c = useCriteria();
  const [open, setOpen] = useState<null | 'budget' | 'distance'>(null);
  const budgetRef = useRef<HTMLButtonElement>(null);
  const distRef = useRef<HTMLButtonElement>(null);
  const budgetOn = !!(c.budget.max || c.budget.min);
  const budgetText = budgetOn
    ? c.budget.max && c.budget.min
      ? `${formatToman(c.budget.min, { unit: false })} تا ${formatToman(c.budget.max, { unit: false })}`
      : c.budget.max
        ? `تا ${formatToman(c.budget.max, { unit: false })}`
        : `از ${formatToman(c.budget.min!, { unit: false })}`
    : 'بودجه';
  const distText = c.distanceKm ? `تا ${DISTANCES.find((d) => d.km === c.distanceKm)?.label}` : 'فاصله';

  return (
    <div className={cn('no-scrollbar flex items-center gap-2 overflow-x-auto', className)} data-testid="criteria-bar">
      <CritChip chipRef={budgetRef} active={budgetOn} onClick={() => setOpen('budget')} icon={Wallet} caret testId="crit-budget">
        {budgetText}
      </CritChip>
      <CritChip chipRef={distRef} active={!!c.distanceKm} onClick={() => setOpen('distance')} icon={Ruler} caret testId="crit-distance">
        {distText}
      </CritChip>
      <CritChip active={c.installment} onClick={() => c.set({ installment: !c.installment })} icon={CreditCard} testId="crit-installment">
        اقساطی
      </CritChip>
      <CritChip active={c.openNow} onClick={() => c.set({ openNow: !c.openNow })} icon={DoorOpen} testId="crit-open">
        الان باز است
      </CritChip>
      <Popover open={open === 'budget'} anchor={budgetRef} onClose={() => setOpen(null)} title="بودجه">
        <BudgetEditor bounds={bounds} onDone={() => setOpen(null)} />
      </Popover>
      <Popover open={open === 'distance'} anchor={distRef} onClose={() => setOpen(null)} title="فاصله از شما">
        <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
          {DISTANCES.map((d) => (
            <button
              key={d.label}
              onClick={() => {
                c.set({ distanceKm: d.km });
                setOpen(null);
              }}
              className={cn(
                'flex h-11 items-center justify-between rounded-xl border px-3 text-[14px]',
                c.distanceKm === d.km ? 'border-accent bg-accent-wash text-accent-strong' : 'border-line hover:bg-surface',
              )}
            >
              {d.label}
              {c.distanceKm === d.km && <Check className="size-4" />}
            </button>
          ))}
        </div>
      </Popover>
    </div>
  );
}

function BudgetEditor({ bounds, onDone }: { bounds: { min: number; max: number } | null; onDone: () => void }) {
  const c = useCriteria();
  const lo = bounds?.min ?? 0;
  const hi = bounds && bounds.max > bounds.min ? bounds.max : (bounds?.min ?? 0) * 2 || 100_000_000;
  const step = Math.max(10_000, Math.round((hi - lo) / 200 / 10_000) * 10_000);
  const [min, setMin] = useState(Math.max(lo, c.budget.min ?? lo));
  const [max, setMax] = useState(Math.min(hi, c.budget.max ?? hi));
  const pct = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-[14px]">
        <span className="text-muted">از</span>
        <span className="font-semibold">{formatToman(min)}</span>
        <span className="text-muted">تا</span>
        <span className="font-semibold">{formatToman(max)}</span>
      </div>
      <div className="relative h-8" dir="rtl">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-surface-2" />
        <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent" style={{ insetInlineStart: `${pct(min)}%`, insetInlineEnd: `${100 - pct(max)}%` }} />
        <input
          type="range"
          aria-label="حداقل بودجه"
          min={lo}
          max={hi}
          step={step}
          value={min}
          onChange={(e) => setMin(Math.min(Number(e.target.value), max - step))}
          className="range-thumb pointer-events-none absolute inset-0 w-full appearance-none bg-transparent"
        />
        <input
          type="range"
          aria-label="حداکثر بودجه"
          min={lo}
          max={hi}
          step={step}
          value={max}
          onChange={(e) => setMax(Math.max(Number(e.target.value), min + step))}
          className="range-thumb pointer-events-none absolute inset-0 w-full appearance-none bg-transparent"
        />
      </div>
      <p className="text-xs text-muted">
        بازه‌ی قیمت گزینه‌های فعلی: {formatToman(lo)} تا {formatToman(hi)}
      </p>
      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={() => {
            c.set({ budget: { min: min > lo ? min : null, max: max < hi ? max : null } });
            onDone();
          }}
          data-testid="budget-apply"
        >
          اعمال
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            c.set({ budget: { min: null, max: null } });
            onDone();
          }}
        >
          حذف بودجه
        </Button>
      </div>
    </div>
  );
}

/** Bottom sheet on mobile, anchored popover on desktop. Portaled so transforms/overflow never clip it. */
export function Popover({
  open,
  anchor,
  onClose,
  title,
  children,
}: {
  open: boolean;
  anchor: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const desktop = useIsDesktop();
  const [pos, setPos] = useState<{ top: number; right: number; up: boolean } | null>(null);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => setMounted(true), []);
  // desktop: open below the anchor; flip above when it doesn't fit; otherwise clamp into the viewport (panel scrolls)
  useLayoutEffect(() => {
    if (!open || !desktop) return;
    const place = () => {
      if (!anchor.current) return;
      const r = anchor.current.getBoundingClientRect();
      const h = panelRef.current?.offsetHeight ?? 0;
      const vh = window.innerHeight;
      const right = Math.max(8, window.innerWidth - r.right);
      if (r.bottom + 8 + h <= vh - 8) setPos({ top: r.bottom + 8, right, up: false });
      else if (r.top - 8 - h >= 8) setPos({ top: r.top - 8 - h, right, up: true });
      else setPos({ top: Math.max(8, vh - 8 - h), right, up: true });
    };
    place();
    const ro = new ResizeObserver(place);
    if (panelRef.current) ro.observe(panelRef.current);
    window.addEventListener('resize', place);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [open, desktop, anchor, mounted]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="bd"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn('fixed inset-0 z-[60]', desktop ? 'bg-transparent' : 'bg-ink/30')}
            onClick={onClose}
          />
          <motion.div
            key="panel"
            role="dialog"
            aria-label={title}
            ref={panelRef}
            initial={desktop ? { opacity: 0, y: pos?.up ? 6 : -6 } : { y: '100%' }}
            animate={desktop ? { opacity: 1, y: 0 } : { y: 0 }}
            exit={desktop ? { opacity: 0, y: pos?.up ? 6 : -6 } : { y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            className={cn(
              'fixed z-[61] bg-canvas p-4 shadow-pop',
              'max-h-[calc(100dvh-16px)] overflow-y-auto',
              desktop ? 'w-[320px] rounded-2xl border border-line' : 'inset-x-0 bottom-0 max-h-[88dvh] rounded-t-[24px] pb-[max(16px,env(safe-area-inset-bottom))]',
            )}
            // hidden until measured so the first frame doesn't flash in the wrong place
            style={desktop ? (pos ? { top: pos.top, right: pos.right } : { top: 0, right: 0, visibility: 'hidden' }) : undefined}
          >
            {!desktop && <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line-strong" />}
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold">{title}</h3>
              <button onClick={onClose} aria-label="بستن" className="flex size-9 items-center justify-center rounded-full hover:bg-surface">
                <X className="size-4" />
              </button>
            </div>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export { toFaDigits };
