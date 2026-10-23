'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useRef, useState } from 'react';
import {
  Copy,
  Footprints,
  Car,
  Navigation2,
  Phone,
  DoorClosed,
  Box,
  MessageSquareText,
  ChevronDown,
  CreditCard,
  ShieldCheck,
  HelpCircle,
  Send,
  Eye,
  CheckCheck,
  AlertTriangle,
  ArrowRight,
  Store,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import type { RankedOffer } from '@/lib/domain/ranking';
import type { InquiryDTO } from '@/lib/inquiries/types';
import { useRankedOffers, useShops } from '@/lib/store/shops';
import { faText, floorLabel, formatDistance, formatMinutes, formatToman, relativeFa, toFaDigits } from '@/lib/domain/format';
import { openInfo, weekRows, willBeOpenAt, minToHHMM, type HoursOverride } from '@/lib/domain/hours';
import { api } from '@/lib/api';
import { Button } from './ui/button';
import { Approx, FreshnessBadge, HoursBadge, StockBadge } from './Badges';
import { stockOf } from './ShopCard';
import { Popover } from './CriteriaBar';
import { Mascot, ThinkingDots } from './Mascot';

export function ShopDetail({
  shopId,
  onBack,
  onOpenShop,
  onMall,
}: {
  shopId: string;
  onBack: () => void;
  onOpenShop: (id: string) => void;
  onMall: (complexId: string, complexName: string) => void;
}) {
  const { all } = useRankedOffers();
  const status = useShops((s) => s.status);
  const o = all.find((x) => x.shopId === shopId);
  const inq = useShops((s) => s.inquiries[shopId]);
  const ovr = useShops((s) => s.overrides[shopId]);
  const closedSession = useShops((s) => !!s.closedSession[shopId]);
  const override: HoursOverride | undefined = closedSession ? { closedToday: true } : ovr ? { closedToday: ovr.closedToday, hoursToday: ovr.hoursToday } : undefined;

  if (!o)
    return (
      <div className="space-y-3 p-1">
        {status === 'loading' || status === 'idle' ? (
          <>
            <div className="skeleton h-6 w-1/2 rounded-full" />
            <div className="skeleton h-24 w-full rounded-2xl" />
            <div className="skeleton h-32 w-full rounded-2xl" />
          </>
        ) : (
          <div className="rounded-2xl border border-dashed p-4 text-center text-[14px]">
            این فروشگاه برای این کالا پیدا نشد.
            <Button size="sm" variant="outline" className="ms-2" onClick={onBack}>
              بازگشت به فهرست
            </Button>
          </div>
        )}
      </div>
    );

  return <Detail o={o} inq={inq} override={override} onBack={onBack} onOpenShop={onOpenShop} onMall={onMall} all={all} />;
}

function Detail({
  o,
  inq,
  override,
  onBack,
  onOpenShop,
  onMall,
  all,
}: {
  o: RankedOffer;
  inq?: InquiryDTO;
  override?: HoursOverride;
  onBack: () => void;
  onOpenShop: (id: string) => void;
  onMall: (complexId: string, complexName: string) => void;
  all: RankedOffer[];
}) {
  const [mode, setMode] = useState<'walk' | 'car'>('walk');
  const [askOpen, setAskOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const askRef = useRef<HTMLButtonElement>(null);
  const helpRef = useRef<HTMLButtonElement>(null);
  const markClosed = useShops((s) => s.markClosed);
  const setClosedFlow = useShops((s) => s.setClosedFlow);
  const s = o.shop;
  const etaMin = mode === 'walk' ? o.walkMin : o.carMin;
  const arriveAt = Date.now() + etaMin * 60_000;
  const info = openInfo(s.hours, override);
  const openAtArrival = willBeOpenAt(s.hours, arriveAt, override);
  const closingSoon = info.open && info.closesAt !== null && (() => {
    const nowMin = minutesNowTehran();
    return info.closesAt! - nowMin <= 60;
  })();
  const closedBeforeEta = info.open === true && openAtArrival === false;
  const openAlternatives = useMemo(
    () => all.filter((x) => x.shopId !== o.shopId && x.open === true && !x.outOfStock).sort((a, b) => a.distanceM - b.distanceM).slice(0, 2),
    [all, o.shopId],
  );

  const address = s.address;
  const chips = [
    s.complex ? { k: 'پاساژ', v: s.complex.name } : null,
    s.floor !== null ? { k: 'طبقه', v: floorLabel(s.floor)!.replace('طبقه ', '') } : null,
    s.unit ? { k: 'واحد', v: toFaDigits(s.unit) } : null,
  ].filter(Boolean) as { k: string; v: string }[];

  return (
    <div className="space-y-3 pb-8" data-testid="shop-detail">
      {/* 1. header */}
      <div className="flex items-start gap-2">
        <button onClick={onBack} aria-label="بازگشت به فهرست" className="-ms-1 flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-surface" data-testid="detail-back">
          <ArrowRight className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-[18px] font-bold leading-8 text-ink">{s.name}</h2>
          <p className="text-[13px] leading-6 text-muted">
            {s.locationLabel} · {toFaDigits(address)}
          </p>
        </div>
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <span key={c.k} className="inline-flex items-baseline gap-1.5 rounded-2xl border border-line bg-surface px-3 py-1.5">
              <span className="text-[11.5px] text-muted">{c.k}</span>
              <span className="text-[16px] font-bold text-ink">{c.v}</span>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            navigator.clipboard?.writeText(`${s.name} — ${address}`).then(
              () => toast.success('آدرس کپی شد'),
              () => toast('کپی نشد'),
            );
          }}
        >
          <Copy className="size-4" />
          کپی آدرس
        </Button>
        <Button ref={helpRef} size="sm" variant="ghost" onClick={() => setHelpOpen(true)} data-testid="find-help">
          <HelpCircle className="size-4" />
          پیدا کردنش سخته؟
        </Button>
      </div>

      {/* proactive banner */}
      {closedBeforeEta && (
        <div className="rounded-2xl border border-warn/30 bg-warn-wash p-3 text-[13.5px] leading-6" data-testid="closing-banner">
          <AlertTriangle className="me-1 inline size-4 text-warn" />
          این فروشگاه تا رسیدن شما بسته است — {toFaDigits(openAlternatives.length)} گزینه باز نزدیک
          <div className="mt-2 flex flex-wrap gap-2">
            {openAlternatives.map((a) => (
              <Button key={a.shopId} size="sm" variant="outline" onClick={() => onOpenShop(a.shopId)}>
                {a.shop.name} · {formatDistance(a.distanceM)}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* 2. ETA */}
      <section className="rounded-2xl border border-line p-3" aria-label="زمان رسیدن">
        <div className="flex items-center gap-2">
          <div className="flex rounded-full bg-surface p-1" role="tablist">
            {(['walk', 'car'] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={cn('flex h-9 items-center gap-1.5 rounded-full px-3 text-[13.5px]', mode === m ? 'bg-canvas font-semibold shadow-soft' : 'text-ink-2')}
              >
                {m === 'walk' ? <Footprints className="size-4" /> : <Car className="size-4" />}
                {m === 'walk' ? 'پیاده' : 'ماشین'}
              </button>
            ))}
          </div>
          <Approx className="ms-auto" />
        </div>
        <div className="mt-3 flex items-end justify-between gap-2">
          <div>
            <div className="text-[26px] font-bold leading-none text-ink" data-testid="eta">
              {formatMinutes(etaMin)}
            </div>
            <div className="mt-1 text-[13px] text-muted">
              {formatDistance(o.distanceM)} فاصله · رسیدن حدود {minToHHMM(minutesNowTehran() + etaMin)}
            </div>
          </div>
          <Button size="sm" variant="soft" onClick={() => toast('مسیریابی دقیق به‌زودی')}>
            <Navigation2 className="size-4" />
            مسیریابی
          </Button>
        </div>
      </section>

      {/* 3. price & stock */}
      <section className="space-y-2.5 rounded-2xl border border-line p-3" aria-label="قیمت و موجودی">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[12px] text-muted">قیمت ثبت‌شده</div>
            <div className={cn('text-[18px] font-bold', o.effectivePrice !== o.price && 'text-[15px] font-medium text-muted line-through')}>{formatToman(o.price)}</div>
            <FreshnessBadge state={o.fresh === 'verified' || o.fresh === 'checking' ? (o.fresh === 'checking' ? 'checking' : 'recent') : o.fresh} at={o.lastChangedAt} className="mt-1" />
          </div>
          {(o.verified || o.effectivePrice !== o.price) && (
            <div className="text-end">
              <div className="text-[12px] text-muted">قیمت تأییدشده</div>
              <motion.div key={o.effectivePrice} initial={{ scale: 1.15 }} animate={{ scale: 1 }} className="text-[20px] font-bold text-ok">
                {formatToman(o.effectivePrice)}
              </motion.div>
              {inq?.repliedAt && <FreshnessBadge state="verified" at={inq.repliedAt} className="mt-1" />}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <StockBadge state={stockOf(o, inq)} />
          <span className="inline-flex items-center gap-1 text-[12px] text-ink-2">
            <ShieldCheck className="size-3.5 text-muted" />
            {o.warranty ? faText(o.warranty) : 'گارانتی ثبت نشده'}
          </span>
        </div>
        {o.sellerTitle && <p className="rounded-xl bg-surface px-3 py-2 text-[12.5px] leading-6 text-ink-2">عنوان فروشنده: {faText(o.sellerTitle)}</p>}
        {inq && <InquiryTimeline inq={inq} />}
        {inq?.question && (
          <div className="rounded-xl bg-surface px-3 py-2 text-[13px] leading-6">
            <div className="text-muted">سؤال شما: {inq.question}</div>
            {inq.answer ? <div className="font-medium text-ink">پاسخ فروشنده: {inq.answer}</div> : <div className="text-muted">منتظر پاسخ فروشنده…</div>}
          </div>
        )}
      </section>

      {/* 4. hours */}
      <HoursSection o={o} override={override} closingSoon={!!closingSoon} closedBeforeEta={closedBeforeEta} />

      {/* 5. payment */}
      <section className="rounded-2xl border border-line p-3" aria-label="پرداخت">
        <h3 className="mb-2 text-[14px] font-semibold">پرداخت</h3>
        <div className="flex flex-wrap gap-2 text-[13px]">
          {s.providers.length ? (
            s.providers.map((p) => (
              <span key={p} className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1', p === 'ترب‌پی' ? 'bg-accent-wash text-accent-strong' : 'bg-surface text-ink-2')}>
                <CreditCard className="size-3.5" />
                {p === 'ترب‌پی' ? 'ترب‌پی (پرداخت حضوری)' : `اقساط ${p}`}
              </span>
            ))
          ) : (
            <span className="text-muted">روش پرداخت ویژه‌ای ثبت نشده (پرداخت عادی در فروشگاه)</span>
          )}
        </div>
      </section>

      {/* 6. actions */}
      <div className="grid grid-cols-2 gap-2">
        <Button ref={askRef} size="lg" className="col-span-2" onClick={() => setAskOpen(true)} data-testid="ask-shop">
          <MessageSquareText className="size-5" />
          استعلام از فروشگاه
        </Button>
        <a
          href={s.phone ? `tel:${toAscii(s.phone)}` : undefined}
          aria-disabled={!s.phone}
          onClick={(e) => !s.phone && (e.preventDefault(), toast('شماره‌ای ثبت نشده'))}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-line text-[15px] font-medium hover:bg-surface"
        >
          <Phone className="size-4" />
          تماس
        </a>
        <Button
          size="lg"
          variant="warn"
          onClick={() => {
            markClosed(o.shopId);
            setClosedFlow(o.shopId);
            toast('متأسفیم! نزدیک‌ترین فروشگاه‌های باز با همین کالا:');
            onBack();
          }}
          data-testid="shop-closed"
        >
          <DoorClosed className="size-4" />
          مغازه بسته بود
        </Button>
        {s.complex && (
          <Button size="lg" variant="outline" className="col-span-2" onClick={() => onMall(s.complex!.id, s.complex!.name)} data-testid="open-mall">
            <Box className="size-4" />
            نمای داخل پاساژ ({s.complex.name})
          </Button>
        )}
      </div>
      <p className="text-center text-[11.5px] text-faint">نام‌ها و شماره‌های فروشگاه‌ها در داده‌ی نمونه ساختگی هستند.</p>

      <Popover open={askOpen} anchor={askRef} onClose={() => setAskOpen(false)} title="استعلام از فروشگاه">
        <AskShopSheet o={o} onDone={() => setAskOpen(false)} />
      </Popover>
      <Popover open={helpOpen} anchor={helpRef} onClose={() => setHelpOpen(false)} title="پیدا کردنش سخته؟">
        <FindShopHelp shopId={o.shopId} />
      </Popover>
    </div>
  );
}

const toAscii = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

function minutesNowTehran() {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  return Number(p.find((x) => x.type === 'hour')?.value) * 60 + Number(p.find((x) => x.type === 'minute')?.value);
}

export function InquiryTimeline({ inq }: { inq: InquiryDTO }) {
  const steps = [
    { label: 'ارسال شد', at: inq.createdAt, Icon: Send, done: true },
    { label: 'دیده شد', at: inq.seenAt, Icon: Eye, done: !!inq.seenAt },
    { label: 'پاسخ داد', at: inq.repliedAt, Icon: CheckCheck, done: inq.status === 'replied' },
  ];
  const current = steps.findIndex((s) => !s.done);
  return (
    <div className="rounded-xl bg-surface p-2.5" data-testid="inquiry-timeline">
      <div className="mb-1.5 flex items-center gap-1.5 text-[12px] text-muted">
        <Mascot size={18} />
        {inq.status === 'timeout' ? (
          <span className="text-warn">فروشنده هنوز جواب نداده</span>
        ) : inq.status === 'replied' ? (
          <span>استعلام انجام شد</span>
        ) : (
          <span className="inline-flex items-center gap-1">
            در حال استعلام از فروشنده <ThinkingDots />
          </span>
        )}
      </div>
      <ol className="flex items-center gap-1">
        {steps.map((s, i) => (
          <li key={s.label} className={cn('flex items-center gap-1', i < steps.length - 1 && 'flex-1')}>
            <span
              className={cn(
                'flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-[12px] transition-colors',
                s.done ? 'bg-ok-wash text-ok' : i === current && inq.status !== 'timeout' ? 'bg-info-wash text-info' : 'text-faint',
              )}
              data-done={s.done}
            >
              {i === current && inq.status !== 'timeout' ? <span className="size-2 rounded-full bg-info animate-pulse-dot" /> : <s.Icon className="size-3.5" />}
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <span className={cn('flex-1 text-center text-[12px]', steps[i + 1].done ? 'text-ok' : 'text-faint')} aria-hidden>
                ←
              </span>
            )}
          </li>
        ))}
      </ol>
      {inq.status === 'replied' && inq.repliedAt && <div className="mt-1 text-[11.5px] text-muted">پاسخ: {relativeFa(inq.repliedAt)}</div>}
    </div>
  );
}

function HoursSection({ o, override, closingSoon, closedBeforeEta }: { o: RankedOffer; override?: HoursOverride; closingSoon: boolean; closedBeforeEta: boolean }) {
  const [open, setOpen] = useState(false);
  const rows = weekRows(o.shop.hours, override);
  const today = rows.find((r) => r.isToday)!;
  return (
    <section className="rounded-2xl border border-line p-3" aria-label="ساعات کاری">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-start" aria-expanded={open}>
        <h3 className="text-[14px] font-semibold">ساعات کاری</h3>
        <HoursBadge hours={o.shop.hours} override={override} />
        <ChevronDown className={cn('ms-auto size-4 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      <div className="mt-2 rounded-xl bg-accent-wash/60 px-3 py-2 text-[13.5px]">
        <b>امروز ({today.label}):</b> {toFaDigits(today.text)}
      </div>
      {(closingSoon || closedBeforeEta) && (
        <p className="mt-2 text-[13px] font-medium text-warn">{closedBeforeEta ? 'تا رسیدن شما بسته می‌شود' : 'کمتر از یک ساعت دیگر می‌بندد'}</p>
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-2 overflow-hidden text-[13px]">
            {rows.map((r) => (
              <li key={r.day} className={cn('flex justify-between rounded-lg px-2 py-1.5', r.isToday && 'bg-surface font-semibold')}>
                <span>{r.label}</span>
                <span className={cn(r.status === 'closed' && 'text-danger', r.status === 'unknown' && 'text-muted')}>{toFaDigits(r.text)}</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
      {!o.shop.hours && <p className="mt-1 text-[12px] text-muted">ساعات کاری ثبت نشده — قبل از رفتن استعلام بگیر.</p>}
    </section>
  );
}

const ASK_CHIPS = ['گارانتی داره؟', 'رنگ دیگه هم داره؟', 'برام کنار می‌ذارید؟', 'تا کی بازید؟'];

function AskShopSheet({ o, onDone }: { o: RankedOffer; onDone: () => void }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [dataAnswer, setDataAnswer] = useState<string | null>(null);
  const inquire = useShops((s) => s.inquire);
  async function submit(question: string | null) {
    setBusy(true);
    setDataAnswer(null);
    try {
      if (question) {
        const r = await api.askShop(o.shopId, o.productId, question).catch(() => ({ answer: null }));
        if (r.answer) {
          setDataAnswer(r.answer);
          // still re-check price/stock silently
          void inquire(o.shopId, null);
          return;
        }
      }
      await inquire(o.shopId, question);
      toast.success(question ? 'سؤالت همراه استعلام برای فروشنده رفت' : 'استعلام قیمت و موجودی ارسال شد');
      onDone();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3" data-testid="ask-sheet">
      <p className="text-[13.5px] leading-6 text-ink-2">
        ترب‌یار همین الان قیمت و موجودی را دوباره از فروشنده می‌پرسد. اگر سؤالی داری اضافه کن؛ اول از اطلاعات ثبت‌شده جواب می‌دهیم.
      </p>
      <div className="flex flex-wrap gap-2">
        {ASK_CHIPS.map((c) => (
          <button key={c} onClick={() => setQ(c)} className={cn('h-10 rounded-full border px-3 text-[13.5px]', q === c ? 'border-accent bg-accent-wash text-accent-strong' : 'border-line hover:bg-surface')}>
            {c}
          </button>
        ))}
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        maxLength={200}
        placeholder="یا سؤال خودت را بنویس (اختیاری)"
        className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-[15px] outline-none focus:border-line-strong"
        aria-label="سؤال از فروشنده"
      />
      {dataAnswer && (
        <div className="rounded-xl border border-ok/30 bg-ok-wash p-3 text-[14px] leading-7" data-testid="data-answer">
          {faText(dataAnswer)}
          <div className="text-[12px] text-muted">طبق اطلاعات ثبت‌شده فروشنده</div>
          <button className="mt-1 text-[13px] font-semibold text-accent-strong" onClick={() => void inquire(o.shopId, q).then(onDone)}>
            باز هم از خود فروشنده بپرس
          </button>
        </div>
      )}
      <Button className="w-full" size="lg" disabled={busy} onClick={() => submit(q.trim() || null)} data-testid="ask-submit">
        {busy ? <ThinkingDots /> : <Store className="size-4" />}
        {q.trim() ? 'بپرس و استعلام بگیر' : 'استعلام قیمت و موجودی'}
      </Button>
    </div>
  );
}

const HELP_CHIPS = ['کدوم ورودی؟', 'کدوم طبقه؟', 'نزدیک چه جایی؟'];

function FindShopHelp({ shopId }: { shopId: string }) {
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function ask(question: string) {
    if (!question.trim()) return;
    setBusy(true);
    setAnswer(null);
    try {
      const r = await api.findHelp(shopId, question);
      setAnswer(r.answer);
    } catch {
      setAnswer('الان جواب نرسید؛ دوباره امتحان کن.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3" data-testid="find-help-sheet">
      <div className="flex flex-wrap gap-2">
        {HELP_CHIPS.map((c) => (
          <button key={c} onClick={() => ask(c)} className="h-10 rounded-full border border-line px-3 text-[13.5px] hover:bg-surface">
            {c}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(q);
        }}
        className="flex gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="سؤالت درباره‌ی پیدا کردن مغازه…"
          className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-[15px] outline-none"
          aria-label="سؤال درباره‌ی مسیر"
        />
        <Button type="submit" size="icon" aria-label="ارسال" disabled={busy}>
          <Send className="size-4" />
        </Button>
      </form>
      {busy && <ThinkingDots />}
      {answer && (
        <div className="flex gap-2 rounded-xl bg-surface p-3 text-[14px] leading-7" data-testid="find-help-answer">
          <Mascot size={28} className="shrink-0" />
          <p>{faText(answer)}</p>
        </div>
      )}
      <p className="text-[11.5px] text-muted">پاسخ از روی آدرس ثبت‌شده و نشانه‌های تقریبی ساخته می‌شود؛ جاهایی که حدس است گفته می‌شود.</p>
    </div>
  );
}
