'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Product } from '@/lib/data/types';
import { useChat, type ChatItem } from '@/lib/store/chat';
import { faText } from '@/lib/domain/format';
import { Mascot } from './Mascot';
import { EnoughPrompt, InlineError, ProductCompareCards, QuestionChips, SpecDiffTable, Suggestions, TextBlock } from './ChatBlocks';
import { ProductCardSkeleton } from './ProductCard';

export function ChatThread({ choosing, onChoose }: { choosing: string | null; onChoose: (p: Product) => void }) {
  const items = useChat((s) => s.items);
  const loading = useChat((s) => s.loading);
  const error = useChat((s) => s.error);
  const send = useChat((s) => s.send);
  const retry = useChat((s) => s.retry);
  const enoughDismissed = useChat((s) => s.enoughDismissed);
  const scrollTop = useChat((s) => s.scrollTop);
  const setScrollTop = useChat((s) => s.setScrollTop);
  const scroller = useRef<HTMLDivElement>(null);
  const restored = useRef(false);
  const lastAssistantIdx = items.map((i) => i.role).lastIndexOf('assistant');
  const lastProductsIdx = (() => {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.role === 'assistant' && it.blocks.some((b) => b.type === 'products')) return i;
    }
    return -1;
  })();

  // restore scroll position when coming back from step 2
  useLayoutEffect(() => {
    if (scroller.current && scrollTop && !restored.current) scroller.current.scrollTop = scrollTop;
    restored.current = true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // follow new messages
  useEffect(() => {
    const el = scroller.current;
    if (!el || !restored.current) return;
    const last = el.querySelector('[data-chat-item]:last-of-type') as HTMLElement | null;
    if (loading) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    else if (last) el.scrollTo({ top: Math.max(0, last.offsetTop - 12), behavior: 'smooth' });
  }, [items.length, loading]);

  const answerOf = (idx: number): string | undefined => {
    const next = items[idx + 1];
    return next && next.role === 'user' ? next.text : undefined;
  };

  return (
    <div
      ref={scroller}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      className="no-scrollbar flex-1 overflow-y-auto overscroll-contain"
      data-testid="chat-thread"
    >
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 px-4 pb-6 pt-4 lg:max-w-[1040px]">
        {items.map((it, idx) => (
          <div key={it.id} data-chat-item className="scroll-mt-4">
            {it.role === 'user' ? (
              <UserBubble text={it.text} />
            ) : (
              <AssistantTurn
                item={it}
                isLatest={idx === lastAssistantIdx}
                productsLatest={idx === lastProductsIdx}
                answered={answerOf(idx)}
                enoughDismissed={enoughDismissed}
                busy={loading}
                choosing={choosing}
                onChoose={onChoose}
                onReply={(r) => send(r)}
                onEnough={() => send('همینا خوبن', 'enough')}
                onRefine={() => send('دقیق‌ترش کن', 'refine')}
              />
            )}
          </div>
        ))}
        <AnimatePresence>
          {loading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3" data-testid="thinking">
              <Mascot size={36} thinking />
              {items.at(-1)?.role === 'user' && items.length > 1 && (
                <div className="grid grid-cols-[85vw_85vw] gap-3 overflow-hidden lg:grid-cols-3">
                  <ProductCardSkeleton />
                  <ProductCardSkeleton />
                  <div className="hidden lg:block">
                    <ProductCardSkeleton />
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        {error && !loading && <InlineError message={error} onRetry={retry} />}
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
      <p className="max-w-[85%] rounded-[20px] rounded-ee-md bg-surface-2 px-4 py-2.5 text-[15px] leading-7 text-ink" data-testid="user-bubble">
        {faText(text)}
      </p>
    </motion.div>
  );
}

function AssistantTurn({
  item,
  isLatest,
  productsLatest,
  answered,
  enoughDismissed,
  busy,
  choosing,
  onChoose,
  onReply,
  onEnough,
  onRefine,
}: {
  item: Extract<ChatItem, { role: 'assistant' }>;
  isLatest: boolean;
  productsLatest: boolean;
  answered?: string;
  enoughDismissed: boolean;
  busy: boolean;
  choosing: string | null;
  onChoose: (p: Product) => void;
  onReply: (r: string) => void;
  onEnough: () => void;
  onRefine: () => void;
}) {
  const productsBlock = item.blocks.find((b) => b.type === 'products');
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
      {item.blocks.map((b, i) => {
        switch (b.type) {
          case 'text':
            return <TextBlock key={i} b={b} />;
          case 'question':
            return (
              <QuestionChips key={i} question={b.question} replies={b.replies} active={isLatest && !busy} answered={answered} onReply={onReply} />
            );
          case 'products':
            return (
              <ProductCompareCards
                key={i}
                products={b.products}
                why={b.why}
                freshLabel={b.freshLabel}
                latest={productsLatest}
                choosing={productsLatest ? choosing : null}
                onChoose={onChoose}
              />
            );
          case 'specDiff':
            return productsBlock && productsBlock.type === 'products' && productsLatest ? (
              <SpecDiffTable key={i} products={b.productIds.map((id) => productsBlock.products.find((p) => p.id === id)!).filter(Boolean)} rows={b.rows} />
            ) : null;
          case 'enough':
            return (
              <AnimatePresence key={i}>
                {isLatest && !enoughDismissed && <EnoughPrompt onEnough={onEnough} onRefine={onRefine} disabled={busy} />}
              </AnimatePresence>
            );
          case 'suggestions':
            return <Suggestions key={i} items={b.items} onPick={onReply} />;
          default:
            return null;
        }
      })}
    </motion.div>
  );
}
