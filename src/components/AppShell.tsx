'use client';
import dynamic from 'next/dynamic';
import { AnimatePresence, LayoutGroup, motion, MotionConfig } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Toaster, toast } from 'sonner';
import { Menu, Plus, PanelRight, LogIn, Store, Info } from 'lucide-react';
import { navigate, useRoute } from '@/lib/nav';
import { useChat } from '@/lib/store/chat';
import { useCriteria } from '@/lib/store/criteria';
import { useRankedOffers, useShops } from '@/lib/store/shops';
import { useMapStore } from '@/lib/store/map';
import { useIsDesktop } from '@/lib/useMedia';
import { api } from '@/lib/api';
import type { Product } from '@/lib/data/types';
import { cn } from '@/lib/cn';
import { Mascot } from './Mascot';
import { PromptPill } from './PromptPill';
import { ChatThread } from './ChatThread';
import { CriteriaBar, Popover } from './CriteriaBar';
import { ProductCardPinned } from './ProductCard';
import { ShopsPanel } from './ShopsPanel';
import { ShopDetail } from './ShopDetail';
import { BottomSheet } from './BottomSheet';
import { MallOverlay } from './MallOverlay';
import type { MapPadding } from './map/MapView';

const MapView = dynamic(() => import('./map/MapView'), { ssr: false });

const EXAMPLES = ['گوشی سامسونگ S25 FE', 'هندزفری بی‌سیم زیر ۵ میلیون', 'اسپیکر جی‌بی‌ال', 'شارژر اپل ۲۰ وات'];

export function AppShell() {
  const route = useRoute();
  const desktop = useIsDesktop();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const items = useChat((s) => s.items);
  const loading = useChat((s) => s.loading);
  const send = useChat((s) => s.send);
  const started = items.length > 0;
  const [choosing, setChoosing] = useState<string | null>(null);
  const [snap, setSnap] = useState(0.55);
  const product = useShops((s) => s.product);
  const productId = route.step === 'chat' ? null : route.productId;
  const shopId = route.step === 'shop' ? route.shopId : null;
  const mall = useMapStore((s) => s.mall);
  const highlight = useShops((s) => s.highlight);

  // ---------- history awareness: back buttons replay transitions in reverse ----------
  const pathname = usePathname();
  const history = useRef<string[]>([]);
  useEffect(() => {
    const h = history.current;
    if (h.at(-2) === pathname) h.pop();
    else if (h.at(-1) !== pathname) h.push(pathname);
  }, [pathname]);
  const backTo = useCallback((path: string) => {
    if (history.current.at(-2) === path) window.history.back();
    else navigate(path);
  }, []);

  // ---------- load offers for the routed product ----------
  useEffect(() => {
    if (!productId) return;
    void useShops.getState().load(productId, useChat.getState().products[productId] ?? null);
  }, [productId]);

  useInquiryAgent(route.step, productId, shopId);
  useMallFromRoute(route.step === 'shop' && route.mall, shopId, productId);

  const onChoose = useCallback((p: Product) => {
    setChoosing(p.id);
    useChat.getState().remember(p);
    useShops.setState({ product: p });
    setTimeout(() => {
      navigate(`/p/${encodeURIComponent(p.id)}`);
      setChoosing(null);
      setSnap(0.55);
    }, 180);
  }, []);
  const backToChat = useCallback(() => backTo('/'), [backTo]);
  const openShop = useCallback(
    (id: string) => {
      if (!productId) return;
      useShops.getState().setHighlight(id, 'card');
      navigate(`/p/${encodeURIComponent(productId)}/s/${encodeURIComponent(id)}`);
    },
    [productId],
  );
  const backToList = useCallback(() => productId && backTo(`/p/${encodeURIComponent(productId)}`), [productId, backTo]);
  const onPinClick = useCallback(
    (id: string) => {
      if (route.step === 'shop') {
        openShop(id);
        return;
      }
      useShops.getState().setHighlight(id, 'pin');
      if (!desktop) setSnap(0.22);
    },
    [route.step, desktop, openShop],
  );
  const onMall = useCallback(
    (complexId: string, complexName: string) => {
      if (!shopId) return;
      useMapStore.getState().setMall({ complexId, complexName, targetShopId: shopId, status: 'loading', isolate: null, picked: null });
      navigate(`${window.location.pathname}?mall=1`);
    },
    [shopId],
  );
  const exitMall = useCallback(() => {
    if (history.current.at(-1) === window.location.pathname && window.location.search.includes('mall=1')) window.history.back();
    else navigate(window.location.pathname);
  }, []);
  const onMallShop = useCallback((id: string) => {
    const m = useMapStore.getState().mall;
    const s = m?.data?.shops.find((x) => x.id === id) ?? null;
    useMapStore.getState().patchMall({ picked: s });
  }, []);

  const newChat = useCallback(() => {
    useChat.getState().reset();
    useCriteria.getState().reset();
    navigate('/');
  }, []);

  // ---------- bounds for the budget slider ----------
  const offers = useShops((s) => s.offers);
  const bounds = useMemo(() => {
    if (route.step !== 'chat' && offers.length) {
      const ps = offers.map((o) => o.price);
      return { min: Math.min(...ps), max: Math.max(...ps) };
    }
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.role !== 'assistant') continue;
      const b = it.blocks.find((x) => x.type === 'products');
      if (b && b.type === 'products') return { min: Math.min(...b.products.map((p) => p.minPrice)), max: Math.max(...b.products.map((p) => p.maxPrice)) };
    }
    return null;
  }, [route.step, offers, items]);

  // ---------- map padding (keeps pins clear of overlays) ----------
  const [vh, setVh] = useState(844);
  useEffect(() => {
    const f = () => setVh(window.innerHeight);
    f();
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  const padding: MapPadding = useMemo(() => {
    if (desktop || route.step !== 'shops' || mall) return { top: 16, bottom: 16, left: 16, right: 16 };
    return { top: 190, bottom: Math.round(vh * snap), left: 12, right: 12 };
  }, [desktop, route.step, mall, vh, snap]);

  const pinned = product && productId && product.id === productId ? product : productId ? useChat.getState().products[productId] : null;

  const mapVisible = route.step !== 'chat';
  // map container geometry per layout
  const mapBox: React.CSSProperties = desktop
    ? { top: 0, bottom: 0, insetInlineEnd: 0, insetInlineStart: mall ? 0 : route.step === 'shop' ? '50%' : 420 }
    : route.step === 'shop' && !mall
      ? { top: 0, insetInlineStart: 0, insetInlineEnd: 0, height: '40%' }
      : { inset: 0 };

  return (
    <MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
      <LayoutGroup>
        <div className="fixed inset-0 flex overflow-hidden bg-canvas" data-step={route.step} data-ready={mounted ? '1' : undefined}>
          <Rail onNew={newChat} />
          <main className="relative min-w-0 flex-1">
            {/* the map: mounted once, hidden in step 1 */}
            <motion.div
              className={cn('absolute overflow-hidden bg-surface-2', !mapVisible && 'pointer-events-none')}
              style={mapBox}
              initial={false}
              animate={{ opacity: mapVisible ? 1 : 0 }}
              transition={{ duration: 0.35, delay: mapVisible ? 0.12 : 0 }}
              aria-hidden={!mapVisible}
            >
              {mounted && (started || mapVisible) && <MapView step={route.step} shopId={shopId} padding={padding} onPinClick={onPinClick} onMallShop={onMallShop} />}
              {mall && <MallOverlay onExit={exitMall} onOpenShop={(id) => (exitMall(), setTimeout(() => openShop(id), 50))} />}
            </motion.div>

            <AnimatePresence initial={false} mode="popLayout">
              {route.step === 'chat' && (
                <motion.section
                  key="chat"
                  className="absolute inset-0 flex flex-col bg-canvas"
                  initial={{ opacity: 0, x: -40 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 60, transition: { duration: 0.32, ease: [0.4, 0, 0.2, 1] } }}
                >
                  <ChatStep
                    desktop={desktop}
                    started={started}
                    loading={loading}
                    send={send}
                    bounds={bounds}
                    choosing={choosing}
                    onChoose={onChoose}
                    onNew={newChat}
                  />
                </motion.section>
              )}
            </AnimatePresence>

            {/* step 2/3 desktop: right panel */}
            {desktop && route.step !== 'chat' && !mall && (
              <motion.aside
                key="panel"
                className="absolute inset-y-0 start-0 z-10 flex flex-col border-e border-line bg-canvas"
                style={{ width: route.step === 'shop' ? '50%' : 420 }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.25 }}
                data-testid="side-panel"
              >
                <div className="no-scrollbar flex-1 overflow-y-auto px-4 pb-4 pt-4">
                  <div className="space-y-3">
                    {pinned ? <ProductCardPinned p={pinned} onChange={backToChat} /> : <div className="skeleton h-[140px] rounded-[20px]" />}
                    <CriteriaBar bounds={bounds} className="-mx-4 px-4" />
                    {route.step === 'shops' ? (
                      <ShopsPanel onOpenShop={openShop} />
                    ) : (
                      <ShopDetail shopId={shopId!} onBack={backToList} onOpenShop={openShop} onMall={onMall} />
                    )}
                  </div>
                </div>
              </motion.aside>
            )}

            {/* step 2/3 mobile */}
            {!desktop && mounted && route.step !== 'chat' && !mall && (
              <>
                {route.step === 'shops' ? (
                  <>
                    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 space-y-2 px-3 pt-[max(10px,env(safe-area-inset-top))]">
                      <div className="pointer-events-auto">
                        {pinned ? <ProductCardPinned p={pinned} onChange={backToChat} compact /> : <div className="skeleton h-[104px] rounded-[20px]" />}
                      </div>
                      <div className="pointer-events-auto">
                        <CriteriaBar bounds={bounds} className="-mx-3 px-3" />
                      </div>
                    </div>
                    <BottomSheet snap={snap} setSnap={setSnap} title="فروشگاه‌ها">
                      <ShopsPanel onOpenShop={openShop} peekShopId={highlight?.by === 'pin' && snap < 0.5 ? highlight.shopId : null} />
                    </BottomSheet>
                  </>
                ) : (
                  <motion.div
                    key="detail"
                    initial={{ y: 40, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="absolute inset-x-0 bottom-0 z-20 h-[60%] overflow-y-auto overscroll-contain rounded-t-[24px] border-t border-line bg-canvas px-3 pt-3 shadow-[0_-8px_30px_rgb(16_24_40/0.12)]"
                    data-testid="detail-sheet"
                  >
                    <div className="space-y-3">
                      {pinned && <ProductCardPinned p={pinned} onChange={backToChat} compact />}
                      <ShopDetail shopId={shopId!} onBack={backToList} onOpenShop={openShop} onMall={onMall} />
                    </div>
                  </motion.div>
                )}
              </>
            )}
          </main>
        </div>
        <Toaster position="top-center" dir="rtl" richColors toastOptions={{ style: { fontFamily: 'inherit' } }} />
      </LayoutGroup>
    </MotionConfig>
  );
}

function ChatStep({
  desktop,
  started,
  loading,
  send,
  bounds,
  choosing,
  onChoose,
  onNew,
}: {
  desktop: boolean;
  started: boolean;
  loading: boolean;
  send: (t: string) => void;
  bounds: { min: number; max: number } | null;
  choosing: string | null;
  onChoose: (p: Product) => void;
  onNew: () => void;
}) {
  return (
    <>
      {/* chrome */}
      <div className="lg:hidden">
        <MobileTopBar onNew={onNew} />
      </div>
      <div className="absolute end-6 top-5 z-10 hidden lg:block">
        <LoginLink />
      </div>
      {started && (
        <div className="mx-auto w-full max-w-[1040px] px-4 pt-1 lg:pt-5">
          <CriteriaBar bounds={bounds} className="-mx-4 px-4 lg:mx-0 lg:px-0" />
        </div>
      )}
      <AnimatePresence initial={false} mode="popLayout">
        {!started ? (
          <motion.div
            key="empty"
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-1 flex-col items-center justify-center px-5 pb-[12vh]"
            data-testid="empty-state"
          >
            <Mascot size={68} />
            <h1 className="mt-4 text-[26px] font-bold text-ink">من ترب‌یارم</h1>
            <p className="mt-3 max-w-[420px] text-center text-[16px] leading-8 text-muted">
              بگو چی میخوای بخری تا با هم مدل‌ها، قیمت‌ها و نزدیک‌ترین فروشگاه رو پیدا کنیم.
            </p>
            <motion.div layoutId="prompt-pill" className="mt-7 w-full max-w-[620px]">
              <PromptPill onSend={send} disabled={loading} autoFocus={desktop} />
            </motion.div>
            <p className="mt-4 text-center text-[13px] text-muted">جست‌وجو · مقایسه · پیشنهاد · پیدا کردن ارزون‌ترین فروشگاه نزدیک</p>
            <div className="mt-6 flex max-w-[620px] flex-wrap justify-center gap-2">
              {EXAMPLES.map((e, i) => (
                <motion.button
                  key={e}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + i * 0.05 }}
                  onClick={() => send(e)}
                  className="h-10 rounded-full border border-line bg-canvas px-4 text-[14px] text-ink-2 transition-colors hover:border-accent-soft hover:bg-accent-wash"
                  data-testid="example-chip"
                >
                  {e}
                </motion.button>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div key="thread" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-0 flex-1 flex-col">
            <ChatThread choosing={choosing} onChoose={onChoose} />
            <motion.div
              layoutId="prompt-pill"
              className="mx-auto w-full max-w-[720px] px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2"
            >
              <PromptPill onSend={send} disabled={loading} placeholder="بیشتر بگو یا اصلاح کن…" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function LoginLink() {
  return (
    <button onClick={() => toast('ورود به‌زودی؛ برای دمو نیازی به ورود نیست.')} className="h-10 rounded-full px-3 text-[14px] text-ink hover:bg-surface">
      ورود
    </button>
  );
}

function MobileTopBar({ onNew }: { onNew: () => void }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between px-2 pt-[env(safe-area-inset-top)]">
      <AppMenu trigger={(ref, open) => (
        <button ref={ref} onClick={open} aria-label="منو" className="flex size-11 items-center justify-center rounded-full hover:bg-surface">
          <Menu className="size-6 text-ink-2" />
        </button>
      )} onNew={onNew} />
      <div className="flex items-center">
        <LoginLink />
        <button onClick={onNew} aria-label="گفت‌وگوی تازه" className="flex size-11 items-center justify-center rounded-full hover:bg-surface">
          <Plus className="size-6 text-ink-2" />
        </button>
      </div>
    </header>
  );
}

function Rail({ onNew }: { onNew: () => void }) {
  return (
    <nav className="z-20 hidden w-14 shrink-0 flex-col items-center gap-2 border-e border-line bg-surface py-4 lg:flex" aria-label="نوار کناری">
      <AppMenu trigger={(ref, open) => (
        <button ref={ref} onClick={open} aria-label="باز کردن منو" className="flex size-10 items-center justify-center rounded-xl text-ink-2 hover:bg-surface-2">
          <PanelRight className="size-5" />
        </button>
      )} onNew={onNew} />
      <button onClick={onNew} aria-label="گفت‌وگوی تازه" className="flex size-10 items-center justify-center rounded-xl text-ink-2 hover:bg-surface-2" data-testid="new-chat">
        <Plus className="size-5" />
      </button>
      <button
        onClick={() => toast('ورود به‌زودی؛ برای دمو نیازی به ورود نیست.')}
        aria-label="ورود"
        className="mt-auto flex size-10 items-center justify-center rounded-xl text-ink-2 hover:bg-surface-2"
      >
        <LogIn className="size-5 -scale-x-100" />
      </button>
    </nav>
  );
}

function AppMenu({ trigger, onNew }: { trigger: (ref: React.RefObject<HTMLButtonElement | null>, open: () => void) => React.ReactNode; onNew: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      {trigger(ref, () => setOpen(true))}
      <Popover open={open} anchor={ref} onClose={() => setOpen(false)} title="ترب‌یار">
        <div className="space-y-1">
          <MenuItem icon={Plus} label="گفت‌وگوی تازه" onClick={() => (onNew(), setOpen(false))} />
          <MenuItem icon={Store} label="پنل فروشنده (دمو)" onClick={() => window.location.assign(window.location.origin + '/shop')} />
          <MenuItem
            icon={Info}
            label="درباره‌ی داده‌ها"
            onClick={() => {
              setOpen(false);
              toast('داده‌ها: فروشگاه‌ها، کالاها و قیمت‌های ثبت‌شده در ترب (تهران). نام و شماره‌ی فروشگاه‌ها ساختگی است؛ زمان رسیدن تقریبی است.', { duration: 8000 });
            }}
          />
        </div>
      </Popover>
    </>
  );
}

function MenuItem({ icon: Icon, label, onClick }: { icon: typeof Plus; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-start text-[15px] hover:bg-surface">
      <Icon className="size-5 text-muted" />
      {label}
    </button>
  );
}

/** §4: auto-inquire the top 3 on entering step 2, and any opened shop; poll while something is pending. */
function useInquiryAgent(step: string, productId: string | null, shopId: string | null) {
  const status = useShops((s) => s.status);
  const { all } = useRankedOffers();
  const inquiries = useShops((s) => s.inquiries);
  useEffect(() => {
    if (step === 'chat' || !productId || status !== 'ready' || !all.length) return;
    const st = useShops.getState();
    if (st.autoInquired[productId]) return;
    st.setAutoInquired(productId);
    const top = [...all].sort((a, b) => b.score - a.score).slice(0, 3);
    for (const o of top) void st.inquire(o.shopId);
  }, [step, productId, status, all]);
  useEffect(() => {
    if (step !== 'shop' || !shopId || status !== 'ready') return;
    const st = useShops.getState();
    if (!st.inquiries[shopId]) void st.inquire(shopId);
  }, [step, shopId, status]);
  const pendingIds = Object.values(inquiries)
    .filter((i) => i.status !== 'replied')
    .map((i) => i.id)
    .sort()
    .join(',');
  useEffect(() => {
    if (!pendingIds) return;
    let alive = true;
    const t = setInterval(async () => {
      try {
        const r = await api.inquiries(pendingIds.split(','));
        if (alive) useShops.getState().applyInquiries(r.inquiries);
      } catch {
        /* keep polling */
      }
    }, 1500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pendingIds]);
}

function useMallFromRoute(active: boolean, shopId: string | null, productId: string | null) {
  const offers = useShops((s) => s.offers);
  useEffect(() => {
    const ms = useMapStore.getState();
    if (!active || !shopId) {
      if (ms.mall) ms.setMall(null);
      return;
    }
    const shop = offers.find((o) => o.shopId === shopId)?.shop;
    if (!ms.mall) {
      if (!shop?.complex) return;
      ms.setMall({ complexId: shop.complex.id, complexName: shop.complex.name, targetShopId: shopId, status: 'loading', isolate: null, picked: null });
    }
    const m = useMapStore.getState().mall!;
    if (m.status !== 'loading') return;
    api
      .complex(m.complexId, productId ?? undefined)
      .then((r) => {
        const cur = useMapStore.getState().mall;
        if (!cur || cur.complexId !== m.complexId) return;
        useMapStore.getState().patchMall({
          status: 'ready',
          data: {
            centroid: { lat: r.complex.centroidLat, lon: r.complex.centroidLon },
            shops: r.shops,
            sellerIds: r.offerShopIds,
            targetId: m.targetShopId,
          },
        });
      })
      .catch(() => useMapStore.getState().patchMall({ status: 'error' }));
  }, [active, shopId, productId, offers]);
}
