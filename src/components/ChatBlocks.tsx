'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useRef, useState } from 'react';
import { Sparkles, SlidersHorizontal, ThumbsUp, Info, RotateCcw } from 'lucide-react';
import type { SpecDiffRow, UIBlock } from '@/lib/agent/blocks';
import type { Product } from '@/lib/data/types';
import { cn } from '@/lib/cn';
import { faText, toFaDigits, formatToman } from '@/lib/domain/format';
import { useCriteria } from '@/lib/store/criteria';
import { ProductCardFull } from './ProductCard';
import { Button, Chip } from './ui/button';

export function QuestionChips({
  question,
  replies,
  active,
  answered,
  onReply,
}: {
  question: string;
  replies: string[];
  active: boolean;
  answered?: string;
  onReply: (r: string) => void;
}) {
  return (
    <div className="space-y-3" data-testid="question">
      <p className="text-[16px] leading-8 text-ink">{toFaDigits(question)}</p>
      <div className="flex flex-wrap gap-2">
        {replies.map((r, i) => (
          <motion.button
            key={r}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i }}
            disabled={!active}
            onClick={() => onReply(r)}
            className={cn(
              'h-11 rounded-full border px-4 text-[14px] transition-colors',
              answered === r
                ? 'border-ink bg-ink text-white'
                : active
                  ? 'border-line bg-canvas text-ink hover:border-accent-soft hover:bg-accent-wash'
                  : 'border-line bg-canvas text-faint',
            )}
            data-testid="quick-reply"
          >
            {toFaDigits(r)}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

export function EnoughPrompt({ onEnough, onRefine, disabled }: { onEnough: () => void; onRefine: () => void; disabled?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface px-4 py-3"
      data-testid="enough-prompt"
    >
      <span className="text-[15px] text-ink">همینا خوبن یا دقیق‌ترش کنم؟</span>
      <div className="ms-auto flex gap-2">
        <Button size="sm" variant="outline" onClick={onEnough} disabled={disabled} data-testid="enough-yes">
          <ThumbsUp className="size-4" />
          همینا خوبن
        </Button>
        <Button size="sm" variant="soft" onClick={onRefine} disabled={disabled} data-testid="enough-refine">
          <SlidersHorizontal className="size-4" />
          دقیق‌ترش کن
        </Button>
      </div>
    </motion.div>
  );
}

export function ProductCompareCards({
  products,
  why,
  freshLabel,
  latest,
  choosing,
  onChoose,
}: {
  products: Product[];
  why: Record<string, string>;
  freshLabel: Record<string, string>;
  latest: boolean;
  choosing: string | null;
  onChoose: (p: Product) => void;
}) {
  const budget = useCriteria((s) => s.budget);
  const setCriteria = useCriteria((s) => s.set);
  const visible = useMemo(
    () => products.filter((p) => (!budget.max || p.minPrice <= budget.max) && (!budget.min || p.maxPrice >= budget.min)),
    [products, budget],
  );
  const scroller = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);

  if (!visible.length) {
    const cheapest = [...products].sort((a, b) => a.minPrice - b.minPrice)[0];
    return (
      <div className="rounded-2xl border border-dashed border-line-strong bg-surface p-4 text-[14px] leading-7 text-ink-2" data-testid="relaxation">
        با این بودجه کالایی از این پیشنهادها پیدا نشد؛ ارزان‌ترینشان از {formatToman(cheapest.minPrice)} شروع می‌شود.{' '}
        <button className="font-semibold text-accent-strong underline-offset-4 hover:underline" onClick={() => setCriteria({ budget: { min: null, max: null } })}>
          بودجه را بردار
        </button>
      </div>
    );
  }

  return (
    <div>
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          const w = el.firstElementChild ? (el.firstElementChild as HTMLElement).offsetWidth + 12 : el.clientWidth;
          setIdx(Math.round(Math.abs(el.scrollLeft) / w));
        }}
        className={cn(
          'no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1',
          'lg:mx-0 lg:grid lg:snap-none lg:overflow-visible lg:px-0',
          visible.length === 2 ? 'lg:grid-cols-2' : visible.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4',
        )}
        data-testid="compare-cards"
      >
        <AnimatePresence initial={false}>
          {visible.map((p) => (
            <motion.div
              key={p.id}
              layout={latest ? 'position' : false}
              className="w-[85vw] max-w-[360px] shrink-0 snap-center lg:w-auto lg:max-w-none"
            >
              {latest ? (
                <ProductCardFull
                  p={p}
                  why={why[p.id]}
                  freshLabel={freshLabel[p.id]}
                  onChoose={() => onChoose(p)}
                  dimmed={!!choosing && choosing !== p.id}
                  chosen={choosing === p.id}
                />
              ) : (
                <StaticCard p={p} why={why[p.id]} onChoose={() => onChoose(p)} />
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {visible.length > 1 && (
        <div className="mt-2 flex justify-center gap-1.5 lg:hidden" aria-hidden>
          {visible.map((p, i) => (
            <span key={p.id} className={cn('h-1.5 rounded-full transition-all', i === idx ? 'w-5 bg-accent' : 'w-1.5 bg-line-strong')} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Older result sets: same content without the shared layoutId (only the latest set animates). */
function StaticCard({ p, why, onChoose }: { p: Product; why?: string; onChoose: () => void }) {
  return (
    <button onClick={onChoose} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-canvas p-2.5 text-start opacity-80 hover:opacity-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={p.images[0]} alt="" referrerPolicy="no-referrer" loading="lazy" className="size-14 shrink-0 rounded-xl bg-white object-contain" />
      <span className="min-w-0">
        <span className="line-clamp-2 text-[13px] font-medium text-ink">{faText(p.title)}</span>
        {why && <span className="line-clamp-1 text-[12px] text-muted">{faText(why)}</span>}
      </span>
    </button>
  );
}

export function SpecDiffTable({ products, rows }: { products: Product[]; rows: SpecDiffRow[] }) {
  return (
    <details className="group rounded-2xl border border-line bg-canvas" open>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[14px] font-semibold text-ink">
        <Sparkles className="size-4 text-accent" />
        فرق‌های اصلی
        <span className="ms-auto text-xs font-normal text-muted group-open:hidden">نمایش</span>
      </summary>
      <div className="no-scrollbar overflow-x-auto border-t border-line" data-testid="spec-diff">
        <table className="w-full min-w-[480px] border-collapse text-[13px]">
          <thead>
            <tr>
              <th className="sticky start-0 z-10 w-28 bg-canvas p-2 text-start font-normal text-muted" />
              {products.map((p) => (
                <th key={p.id} className="p-2 text-start align-bottom font-medium text-ink-2">
                  <span className="line-clamp-2">{faText(p.title.split('|')[0])}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-line">
                <th className="sticky start-0 z-10 bg-canvas p-2 text-start font-normal text-muted">{r.key}</th>
                {r.values.map((v, i) => (
                  <td key={i} className={cn('p-2 align-top text-ink', r.bestIndex === i && 'font-semibold text-ok')}>
                    {r.bestIndex === i && <span className="me-1 inline-block size-1.5 rounded-full bg-ok align-middle" />}
                    {v ?? <span className="text-faint">ثبت نشده</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function TextBlock({ b }: { b: Extract<UIBlock, { type: 'text' }> }) {
  if (b.tone === 'relaxed')
    return (
      <p className="flex items-start gap-2 rounded-xl bg-warn-wash px-3 py-2 text-[14px] leading-7 text-ink-2">
        <Info className="mt-1 size-4 shrink-0 text-warn" />
        {faText(b.text)}
      </p>
    );
  return <p className="text-[16px] leading-8 text-ink">{faText(b.text)}</p>;
}

export function Suggestions({ items, onPick }: { items: string[]; onPick: (s: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((s) => (
        <Chip key={s} onClick={() => onPick(s)} className="h-10">
          {toFaDigits(s)}
        </Chip>
      ))}
    </div>
  );
}

export function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#f6d0d0] bg-[#fff6f6] px-4 py-3 text-[14px] text-ink-2" role="alert">
      <span>پاسخ نرسید ({message}). </span>
      <Button size="sm" variant="outline" onClick={onRetry} className="ms-auto" data-testid="retry">
        <RotateCcw className="size-4" />
        دوباره امتحان کن
      </Button>
    </div>
  );
}
