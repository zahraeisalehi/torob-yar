'use client';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { ImageOff, MapPin, Store, ChevronLeft, Smartphone, Headphones, Speaker, PlugZap } from 'lucide-react';
import type { Product } from '@/lib/data/types';
import { cn } from '@/lib/cn';
import { faText, formatRange, formatToman, toFaDigits } from '@/lib/domain/format';
import { Button } from './ui/button';

export const SPRING = { type: 'spring' as const, stiffness: 380, damping: 32 };

function categoryIcon(category: string) {
  if (/گوشی|موبایل/.test(category)) return Smartphone;
  if (/هدفون|هندزفری|هدست/.test(category)) return Headphones;
  if (/اسپیکر|صوتی/.test(category)) return Speaker;
  if (/شارژر|کابل|آداپتور/.test(category)) return PlugZap;
  return ImageOff;
}

export function ProductImage({ src, alt, category, className }: { src?: string; alt: string; category: string; className?: string }) {
  const [failed, setFailed] = useState(!src);
  const [loaded, setLoaded] = useState(false);
  const Icon = categoryIcon(category);
  if (failed)
    return (
      <div className={cn('flex items-center justify-center bg-surface text-faint', className)} aria-label={alt}>
        <Icon className="size-1/3 max-h-10 max-w-10" strokeWidth={1.5} />
      </div>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      onLoad={() => setLoaded(true)}
      className={cn('object-contain transition-opacity', loaded ? 'bg-white opacity-100' : 'skeleton opacity-90', className)}
    />
  );
}

function Carousel({ p }: { p: Product }) {
  const [idx, setIdx] = useState(0);
  const imgs = p.images.length ? p.images : [''];
  return (
    <div className="relative">
      <div
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto rounded-2xl bg-white"
        onScroll={(e) => {
          const el = e.currentTarget;
          setIdx(Math.round(Math.abs(el.scrollLeft) / el.clientWidth));
        }}
      >
        {imgs.map((src, i) => (
          <ProductImage key={i} src={src || undefined} alt={p.title} category={p.category} className="aspect-[16/10] w-full shrink-0 snap-center p-3 lg:aspect-[4/3]" />
        ))}
      </div>
      {imgs.length > 1 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-1.5 flex justify-center gap-1">
          {imgs.map((_, i) => (
            <span key={i} className={cn('h-1.5 rounded-full transition-all', i === idx ? 'w-4 bg-ink/60' : 'w-1.5 bg-ink/20')} />
          ))}
        </div>
      )}
    </div>
  );
}

export function SpecChips({ p, n, className }: { p: Product; n: number; className?: string }) {
  const specs = p.keySpecs.filter((s) => s.value.length <= 28).slice(0, n);
  if (!specs.length) return null;
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {specs.map((s) => (
        <span key={s.key} className="max-w-full truncate rounded-full bg-surface px-2 py-0.5 text-[12px] text-ink-2" title={`${s.key}: ${s.value}`}>
          {faText(s.value)}
        </span>
      ))}
    </div>
  );
}

/** `full` size: step-1 comparison card. */
export function ProductCardFull({
  p,
  why,
  freshLabel,
  onChoose,
  dimmed,
  chosen,
}: {
  p: Product;
  why?: string;
  freshLabel?: string;
  onChoose: () => void;
  dimmed?: boolean;
  chosen?: boolean;
}) {
  return (
    <motion.article
      layoutId={`product-${p.id}`}
      transition={SPRING}
      animate={{ opacity: dimmed ? 0.35 : 1, scale: dimmed ? 0.96 : 1 }}
      className={cn(
        'flex h-full flex-col gap-3 rounded-[20px] border border-line bg-canvas p-3 shadow-soft',
        chosen && 'z-10 ring-2 ring-accent',
      )}
      data-testid="product-card"
    >
      <Carousel p={p} />
      <div className="flex flex-1 flex-col gap-2 px-1">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-7 text-ink">{faText(p.title)}</h3>
        <SpecChips p={p} n={4} />
        <div className="mt-auto space-y-1 pt-1">
          <div className="text-[15px] font-bold text-ink">{formatRange(p.minPrice, p.maxPrice)} <span className="text-xs font-normal text-muted">تومان</span></div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
            <span className="inline-flex items-center gap-1">
              <Store className="size-3.5" />
              در {toFaDigits(p.shopCount)} فروشگاه
            </span>
            {freshLabel && <span>{freshLabel}</span>}
          </div>
        </div>
        {why && (
          <p className="rounded-xl bg-accent-wash/70 px-3 py-2 text-[13px] leading-6 text-ink-2" data-testid="why">
            <span className="font-semibold text-accent-strong">چرا این؟ </span>
            {faText(why)}
          </p>
        )}
      </div>
      <Button onClick={onChoose} size="lg" className="w-full" data-testid="choose-product">
        <MapPin className="size-4" />
        انتخاب و پیدا کردن فروشگاه
      </Button>
    </motion.article>
  );
}

/** `pinned` size: steps 2–3, at least as prominent as a ShopCard. */
export function ProductCardPinned({ p, onChange, compact }: { p: Product; onChange: () => void; compact?: boolean }) {
  return (
    <motion.div
      layoutId={`product-${p.id}`}
      transition={SPRING}
      className={cn(
        'flex w-full items-center gap-3 rounded-[20px] border border-line bg-canvas shadow-soft',
        compact ? 'min-h-[104px] p-2.5' : 'min-h-[140px] p-3',
      )}
      data-testid="pinned-product"
    >
      <button onClick={onChange} className="shrink-0 rounded-2xl" aria-label="بازگشت به مقایسه کالاها">
        <ProductImage
          src={p.images[0]}
          alt={p.title}
          category={p.category}
          className={cn('rounded-2xl border border-line p-1', compact ? 'size-[72px]' : 'size-[104px]')}
        />
      </button>
      {/* the whole text column is a tap target (the title button keeps keyboard access) */}
      <div className="min-w-0 flex-1 cursor-pointer space-y-1" onClick={(e) => !(e.target as HTMLElement).closest('button') && onChange()}>
        <button onClick={onChange} className="block w-full text-start">
          <h2 className={cn('line-clamp-2 font-semibold text-ink', compact ? 'text-[13.5px] leading-6' : 'text-[15px] leading-7')}>{faText(p.title)}</h2>
        </button>
        <SpecChips p={p} n={compact ? 2 : 3} className="max-h-6 overflow-hidden" />
        <div className={cn('text-ink-2', compact ? 'truncate text-[12px]' : 'text-[13px] leading-6')}>
          از {formatRange(p.minPrice, p.maxPrice)} · در {toFaDigits(p.shopCount)} فروشگاه
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={onChange} className={cn('shrink-0 self-start', compact && 'h-8 px-2.5 text-[13px]')} data-testid="change-product">
        <ChevronLeft className="size-4 rotate-180" />
        تغییر
      </Button>
    </motion.div>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="flex h-full flex-col gap-3 rounded-[20px] border border-line bg-canvas p-3">
      <div className="skeleton aspect-[4/3] w-full rounded-2xl" />
      <div className="skeleton h-4 w-4/5 rounded-full" />
      <div className="skeleton h-4 w-3/5 rounded-full" />
      <div className="flex gap-1.5">
        <div className="skeleton h-5 w-14 rounded-full" />
        <div className="skeleton h-5 w-16 rounded-full" />
      </div>
      <div className="skeleton mt-auto h-12 w-full rounded-2xl" />
    </div>
  );
}

export { formatToman };
