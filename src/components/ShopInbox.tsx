'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Check, PackageX, Tag, Delete, DoorClosed, Clock, Store, ChevronLeft, Inbox, BellRing } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import type { Product, Shop } from '@/lib/data/types';
import type { InquiryDTO, ShopOverride } from '@/lib/inquiries/types';
import { cn } from '@/lib/cn';
import { faText, formatFullToman, formatToman, relativeFa, toFaDigits } from '@/lib/domain/format';
import { todayLabel } from '@/lib/domain/hours';
import { Button } from './ui/button';
import { Mascot, ThinkingDots } from './Mascot';
import { ProductImage } from './ProductCard';

type InboxItem = InquiryDTO & { product: Product | null };
type InboxData = { shop: Shop | null; inquiries: InboxItem[]; override: ShopOverride | null };

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error ?? 'خطا');
  return j;
}

export function ShopIndex() {
  const [data, setData] = useState<{ shops: { shopId: string; name: string; address: string; pending: number; token: string }[]; autoReply: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch('/api/shops-pending')
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((j) => alive && (setData(j), setErr(null)))
        .catch((e) => alive && setErr(String(e.message)));
    load();
    const t = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return (
    <main className="mx-auto min-h-dvh max-w-[560px] px-4 py-6" dir="rtl">
      <div className="flex items-center gap-3">
        <Mascot size={44} />
        <div>
          <h1 className="text-[20px] font-bold">پنل فروشنده (دمو)</h1>
          <p className="text-[13px] text-muted">فروشگاه‌هایی که استعلام بی‌پاسخ دارند. روی هرکدام بزن تا صندوقش باز شود.</p>
        </div>
      </div>
      {data?.autoReply && (
        <p className="mt-4 rounded-xl bg-warn-wash px-3 py-2 text-[13px] text-ink-2">
          پاسخ خودکار (AUTO_REPLY) روشن است؛ ربات بعد از چند ثانیه جواب می‌دهد. برای پاسخ دستی، در اپ کاربر آدرس را با <b dir="ltr">?manual=1</b> باز کن یا AUTO_REPLY=0 کن.
        </p>
      )}
      {err === '404' && <p className="mt-6 text-muted">فهرست دمو غیرفعال است (DEMO_INDEX=0).</p>}
      <ul className="mt-5 space-y-2.5" data-testid="shop-index">
        {!data && !err && [0, 1].map((i) => <li key={i} className="skeleton h-20 rounded-2xl" />)}
        {data?.shops.length === 0 && (
          <li className="rounded-2xl border border-dashed border-line-strong p-6 text-center text-[14px] text-muted">
            <Inbox className="mx-auto mb-2 size-7" />
            فعلاً استعلامی در انتظار نیست. از گوشی دیگر یک کالا انتخاب کن تا اینجا ظاهر شود.
          </li>
        )}
        {data?.shops.map((s) => (
          <li key={s.shopId}>
            <Link
              href={`/shop/${encodeURIComponent(s.shopId)}?t=${s.token}`}
              className="flex items-center gap-3 rounded-2xl border border-line bg-canvas p-3.5 hover:shadow-soft"
              data-testid="shop-index-item"
            >
              <span className="flex size-11 items-center justify-center rounded-full bg-accent-wash text-accent-strong">
                <Store className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{s.name}</span>
                <span className="block truncate text-[12.5px] text-muted">{faText(s.address)}</span>
              </span>
              <span className="rounded-full bg-accent px-2.5 py-0.5 text-[13px] font-bold text-white">{toFaDigits(s.pending)}</span>
              <ChevronLeft className="size-5 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
      <Toaster position="top-center" dir="rtl" />
    </main>
  );
}

export function ShopInbox({ shopId }: { shopId: string }) {
  const token = useSearchParams()?.get('t') ?? '';
  const [data, setData] = useState<InboxData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const q = `?t=${encodeURIComponent(token)}`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/shop/${encodeURIComponent(shopId)}/inquiries${q}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'خطا');
      setData(j);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا');
    }
  }, [shopId, q]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [load]);

  // opening the inbox = the owner has seen pending inquiries (drives the user's «دیده شد»)
  useEffect(() => {
    for (const i of data?.inquiries ?? [])
      if (i.status === 'sent') void post(`/api/inquiries/${i.id}/seen${q}`, {}).catch(() => {});
  }, [data, q]);

  const pending = data?.inquiries.filter((i) => i.status !== 'replied') ?? [];
  const done = data?.inquiries.filter((i) => i.status === 'replied') ?? [];

  return (
    <main className="mx-auto min-h-dvh max-w-[560px] bg-surface px-3 pb-10 pt-4" dir="rtl">
      {error ? (
        <div className="mt-10 rounded-2xl bg-canvas p-6 text-center">
          <p className="font-semibold">{error === 'دسترسی ندارید' ? 'لینک نامعتبر است' : error}</p>
          <p className="mt-1 text-[13px] text-muted">لینک صندوق را از پنل دمو (/shop) باز کن.</p>
          <Link href="/shop" className="mt-3 inline-block text-accent-strong">
            رفتن به پنل دمو
          </Link>
        </div>
      ) : !data ? (
        <div className="space-y-3">
          <div className="skeleton h-24 rounded-2xl" />
          <div className="skeleton h-64 rounded-2xl" />
        </div>
      ) : (
        <>
          <header className="rounded-[20px] bg-canvas p-4 shadow-soft">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-wash text-accent-strong">
                <Store className="size-5" />
              </span>
              <div className="min-w-0">
                <h1 className="text-[18px] font-bold">{data.shop?.name ?? 'فروشگاه'}</h1>
                <p className="text-[12.5px] leading-6 text-muted">{faText(data.shop?.address ?? '')}</p>
              </div>
            </div>
            <TodayControls shopId={shopId} q={q} shop={data.shop} override={data.override} onChange={load} />
          </header>

          <h2 className="mb-2 mt-5 flex items-center gap-2 px-1 text-[15px] font-semibold">
            <BellRing className="size-4 text-accent" />
            استعلام‌های جدید
            <span className="rounded-full bg-accent px-2 text-[12px] text-white">{toFaDigits(pending.length)}</span>
          </h2>
          <div className="space-y-3" data-testid="inbox-pending">
            {pending.length === 0 && (
              <p className="rounded-2xl bg-canvas p-5 text-center text-[14px] text-muted">
                <Inbox className="mx-auto mb-2 size-7" />
                استعلام تازه‌ای نیست. هر استعلام جدید خودکار اینجا ظاهر می‌شود.
              </p>
            )}
            <AnimatePresence initial={false}>
              {pending.map((i) => (
                <InquiryCard key={i.id} inq={i} q={q} onDone={load} />
              ))}
            </AnimatePresence>
          </div>

          {done.length > 0 && (
            <>
              <h2 className="mb-2 mt-6 px-1 text-[14px] font-semibold text-muted">پاسخ داده‌شده</h2>
              <ul className="space-y-2">
                {done.slice(0, 10).map((i) => (
                  <li key={i.id} className="flex items-center gap-3 rounded-2xl bg-canvas p-3 text-[13px]">
                    <span className={cn('flex size-8 items-center justify-center rounded-full', i.outcome === 'out_of_stock' ? 'bg-[#fdecec] text-danger' : 'bg-ok-wash text-ok')}>
                      {i.outcome === 'out_of_stock' ? <PackageX className="size-4" /> : <Check className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{faText(i.product?.title ?? '')}</span>
                    <span className="shrink-0 text-muted">
                      {i.outcome === 'confirm' ? 'تأیید' : i.outcome === 'new_price' ? formatToman(i.newPrice ?? 0) : 'تمام شده'} · {relativeFa(i.repliedAt ?? i.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      <Toaster position="top-center" dir="rtl" richColors />
    </main>
  );
}

function TodayControls({ shopId, q, shop, override, onChange }: { shopId: string; q: string; shop: Shop | null; override: ShopOverride | null; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState('10:00');
  const [end, setEnd] = useState('20:00');
  const closed = !!override?.closedToday;
  const label = todayLabel(shop?.hours ?? null, override ? { closedToday: override.closedToday, hoursToday: override.hoursToday } : undefined);
  const save = async (body: unknown, msg: string) => {
    try {
      await post(`/api/shop/${encodeURIComponent(shopId)}/today${q}`, body);
      toast.success(msg);
      onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا');
    }
  };
  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <Clock className="size-4 text-muted" />
        <span>امروز: {label.tone === 'unknown' ? 'ساعات ثبت نشده' : label.text}</span>
        <div className="ms-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)}>
            ساعت امروز
          </Button>
          <Button size="sm" variant={closed ? 'ok' : 'danger'} onClick={() => save({ closedToday: !closed }, closed ? 'امروز باز هستید' : 'ثبت شد: امروز بسته‌اید')} data-testid="closed-today">
            <DoorClosed className="size-4" />
            {closed ? 'امروز بازیم' : 'امروز بسته‌ایم'}
          </Button>
        </div>
      </div>
      {editing && (
        <div className="mt-3 flex items-center gap-2 text-[13px]">
          از
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="h-10 rounded-xl border border-line px-2" aria-label="شروع" />
          تا
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="h-10 rounded-xl border border-line px-2" aria-label="پایان" />
          <Button
            size="sm"
            onClick={() => {
              setEditing(false);
              void save({ closedToday: false, hours: [{ start, end }] }, 'ساعت امروز ثبت شد');
            }}
          >
            ثبت
          </Button>
        </div>
      )}
    </div>
  );
}

function suggestions(question: string): string[] {
  if (/گارانتی|ضمانت/.test(question)) return ['بله، ۱۸ ماه گارانتی شرکتی', 'گارانتی ۶ ماهه فروشگاه', 'بدون گارانتی'];
  if (/رنگ/.test(question)) return ['بله، مشکی و سفید داریم', 'فقط همین رنگ', 'فردا می‌رسه'];
  if (/کنار|نگه/.test(question)) return ['بله، تا ساعت ۱۸ نگه می‌داریم', 'فقط تا یک ساعت', 'نه، متأسفانه'];
  if (/تا کی|ساعت|باز/.test(question)) return ['تا ساعت ۲۰ بازیم', 'تا ساعت ۱۸', 'امروز تا ۱۴'];
  return ['بله', 'نه، متأسفانه', 'تشریف بیارید در خدمتیم'];
}

function InquiryCard({ inq, q, onDone }: { inq: InboxItem; q: string; onDone: () => void }) {
  const [answer, setAnswer] = useState('');
  const [keypad, setKeypad] = useState(false);
  const [busy, setBusy] = useState(false);
  const send = async (outcome: 'confirm' | 'new_price' | 'out_of_stock', newPrice?: number) => {
    if (inq.question && !answer.trim() && outcome !== 'out_of_stock') {
      toast('لطفاً به سؤال مشتری هم یک جواب کوتاه بده.');
      return;
    }
    setBusy(true);
    try {
      await post(`/api/inquiries/${inq.id}/reply${q}`, { outcome, newPrice, answer: answer.trim() || null });
      toast.success('پاسخ برای مشتری فرستاده شد');
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا');
    } finally {
      setBusy(false);
      setKeypad(false);
    }
  };
  const p = inq.product;
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40 }}
      className="rounded-[20px] bg-canvas p-4 shadow-soft"
      data-testid="inbox-card"
    >
      <div className="flex items-start gap-3">
        {p && <ProductImage src={p.images[0]} alt={p.title} category={p.category} className="size-16 shrink-0 rounded-xl border border-line p-1" />}
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[14.5px] font-semibold leading-6">{faText(p?.title ?? 'کالا')}</h3>
          <div className="mt-0.5 text-[13px] text-ink-2">
            قیمت ثبت‌شده: <b>{formatFullToman(inq.offerPrice)}</b>
          </div>
          <div className="text-[12px] text-muted">{relativeFa(inq.createdAt)}</div>
        </div>
      </div>
      <p className="mt-3 rounded-xl bg-surface px-3 py-2 text-[15px] font-semibold">هنوز موجوده؟ قیمت همینه؟</p>
      {inq.question && (
        <div className="mt-2 space-y-2 rounded-xl border border-accent-soft bg-accent-wash/50 p-3">
          <p className="text-[14px]">
            <span className="text-muted">سؤال مشتری: </span>
            {inq.question}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions(inq.question).map((s) => (
              <button key={s} onClick={() => setAnswer(s)} className={cn('h-9 rounded-full border px-3 text-[13px]', answer === s ? 'border-accent bg-canvas' : 'border-line bg-canvas')}>
                {s}
              </button>
            ))}
          </div>
          <input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            maxLength={200}
            placeholder="جواب کوتاه…"
            className="h-11 w-full rounded-xl border border-line bg-canvas px-3 text-[15px] outline-none"
            aria-label="پاسخ به سؤال مشتری"
            data-testid="inbox-answer"
          />
        </div>
      )}
      <div className="mt-3 grid gap-2">
        <Button size="xl" variant="ok" disabled={busy} onClick={() => send('confirm')} data-testid="reply-confirm">
          <Check className="size-5" />
          موجوده، قیمت همینه
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button size="xl" variant="outline" disabled={busy} onClick={() => setKeypad(true)} data-testid="reply-new-price">
            <Tag className="size-5" />
            قیمت جدید
          </Button>
          <Button size="xl" variant="danger" disabled={busy} onClick={() => send('out_of_stock')} data-testid="reply-oos">
            <PackageX className="size-5" />
            تموم شده
          </Button>
        </div>
      </div>
      {busy && <ThinkingDots className="mt-2" />}
      <AnimatePresence>{keypad && <PriceKeypad initial={inq.offerPrice} onCancel={() => setKeypad(false)} onSubmit={(v) => send('new_price', v)} />}</AnimatePresence>
    </motion.article>
  );
}

function PriceKeypad({ initial, onSubmit, onCancel }: { initial: number; onSubmit: (v: number) => void; onCancel: () => void }) {
  const [digits, setDigits] = useState(String(initial));
  const value = Number(digits || '0');
  const press = (k: string) => setDigits((d) => (k === 'del' ? d.slice(0, -1) : k === '000' ? (d ? d + '000' : d) : (d === '0' ? '' : d) + k).slice(0, 12));
  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-ink/30" onClick={onCancel} />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 420, damping: 38 }}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[560px] rounded-t-[24px] bg-canvas p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-pop"
        data-testid="keypad"
        role="dialog"
        aria-label="قیمت جدید"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line-strong" />
        <div className="text-center text-[13px] text-muted">قیمت جدید (تومان)</div>
        <div className="mt-1 text-center text-[30px] font-bold tabular-nums" data-testid="keypad-value">
          {value ? value.toLocaleString('fa-IR') : '۰'}
        </div>
        <div className="text-center text-[13px] text-muted">{value ? formatToman(value) : ' '}</div>
        <div className="mt-2 flex justify-center gap-2">
          {[-5, -2, 2, 5].map((pct) => (
            <button key={pct} onClick={() => setDigits(String(Math.round((initial * (1 + pct / 100)) / 10000) * 10000))} className="h-9 rounded-full bg-surface px-3 text-[13px]">
              {pct > 0 ? '+' : '−'}
              {toFaDigits(Math.abs(pct))}٪
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2" dir="ltr">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'del'].map((k) => (
            <button
              key={k}
              onClick={() => press(k)}
              className="flex h-14 items-center justify-center rounded-2xl bg-surface text-[22px] font-semibold active:bg-surface-2"
              aria-label={k === 'del' ? 'پاک کردن' : k}
              data-testid={`key-${k}`}
            >
              {k === 'del' ? <Delete className="size-6" /> : toFaDigits(k)}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Button size="xl" className="col-span-2" disabled={!value} onClick={() => onSubmit(value)} data-testid="keypad-submit">
            ثبت قیمت جدید
          </Button>
          <Button size="xl" variant="outline" onClick={onCancel}>
            انصراف
          </Button>
        </div>
      </motion.div>
    </>
  );
}
