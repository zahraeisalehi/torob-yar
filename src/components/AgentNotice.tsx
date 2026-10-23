'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, PackageX, MessageCircle, X, TrendingDown, TrendingUp, Info, DoorClosed } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { cn } from '@/lib/cn';
import { useShops, type Notice } from '@/lib/store/shops';
import { formatToman } from '@/lib/domain/format';
import { Mascot } from './Mascot';

const STYLE: Record<Notice['kind'], { cls: string; Icon: typeof Info }> = {
  confirm: { cls: 'border-ok/30 bg-ok-wash', Icon: CheckCircle2 },
  new_price: { cls: 'border-info/25 bg-info-wash', Icon: TrendingDown },
  out_of_stock: { cls: 'border-danger/25 bg-[#fdf0f0]', Icon: PackageX },
  timeout: { cls: 'border-warn/30 bg-warn-wash', Icon: AlertTriangle },
  answer: { cls: 'border-line bg-surface', Icon: MessageCircle },
  info: { cls: 'border-line bg-surface', Icon: Info },
  closed: { cls: 'border-warn/30 bg-warn-wash', Icon: DoorClosed },
};

export function AgentNotices({
  onOpenShop,
  max = 2,
  shopId,
  kinds,
}: {
  onOpenShop: (shopId: string) => void;
  max?: number;
  /** only notices about this shop (shop detail) */
  shopId?: string;
  kinds?: Notice['kind'][];
}) {
  const all = useShops((s) => s.notices);
  const notices = useMemo(() => all.filter((n) => (!shopId || n.shopId === shopId) && (!kinds || kinds.includes(n.kind))), [all, shopId, kinds]);
  const dismiss = useShops((s) => s.dismissNotice);
  // auto-hide routine confirmations after a while; keep problems until dismissed
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      for (const n of useShops.getState().notices)
        if ((n.kind === 'confirm' || n.kind === 'info') && now - n.at > 12_000) useShops.getState().dismissNotice(n.id);
    }, 2000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="space-y-2" aria-live="polite" data-testid="agent-notices">
      <AnimatePresence initial={false}>
        {notices.slice(0, max).map((n) => {
          const s = STYLE[n.kind];
          const Icon = n.kind === 'new_price' && n.newPrice && n.oldPrice && n.newPrice > n.oldPrice ? TrendingUp : s.Icon;
          return (
            <motion.div
              key={n.id}
              layout
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              className={cn('flex items-start gap-2.5 rounded-2xl border px-3 py-2.5', s.cls)}
              data-testid={`notice-${n.kind}`}
            >
              <Mascot size={26} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1 text-[13.5px] leading-6 text-ink">
                <div className="flex items-start gap-1.5">
                  <Icon className="mt-1 size-4 shrink-0 opacity-70" />
                  <span>{n.text}</span>
                </div>
                {n.kind === 'new_price' && n.oldPrice && n.newPrice && (
                  <div className="mt-0.5 flex items-center gap-2 ps-5">
                    <span className="text-muted line-through">{formatToman(n.oldPrice)}</span>
                    <span>←</span>
                    <motion.span initial={{ scale: 1.2 }} animate={{ scale: 1 }} className="font-bold text-ink">
                      {formatToman(n.newPrice)}
                    </motion.span>
                  </div>
                )}
                {n.action && (
                  <button onClick={() => onOpenShop(n.action!.shopId)} className="mt-1 ms-5 font-semibold text-accent-strong hover:underline">
                    {n.action.label}
                  </button>
                )}
              </div>
              <button onClick={() => dismiss(n.id)} aria-label="بستن پیام" className="-me-1 flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-black/5">
                <X className="size-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
