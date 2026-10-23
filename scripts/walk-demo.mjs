// Walks docs/DEMO_SCRIPT.md at 1440×900 and screenshots every beat.
// usage: node scripts/walk-demo.mjs [base=http://localhost:3000] [outdir=e2e/screenshots/demo]
// Needs a server with AUTO_REPLY=1 AUTO_REPLY_SKIP_QUESTIONS=1 (npm run demo), reset beforehand.
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const OUT = process.argv[3] ?? 'e2e/screenshots/demo';
const DEMO_SHOP = 'ویسا آذریار';
const DEMO_PRODUCT = 'Redmi Buds 8 Active';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let n = 0;
const results = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fa-IR', timezoneId: 'Asia/Tehran', permissions: ['microphone'] });
// headless Chromium has no speech service: stand in for Chrome's webkitSpeechRecognition with the line the presenter says
await ctx.addInitScript(() => {
  class FakeRec {
    start() {
      setTimeout(() => {
        this.onresult?.({ results: [[{ transcript: 'یه هندزفری بی‌سیم می‌خوام' }]] });
        this.onend?.();
      }, 1800);
    }
    stop() {}
    abort() {}
  }
  window.webkitSpeechRecognition = FakeRec;
  window.SpeechRecognition = FakeRec;
});
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
// a Saturday noon in Tehran, so opening hours look like a daytime recording
// setFixedTime pins Date only; timers and animation frames stay real (MapLibre keeps repainting)
await page.clock.setFixedTime(new Date(process.env.WALK_TIME ?? '2026-10-24T12:00:00+03:30'));
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
const tid = (p, id) => p.getByTestId(id);
const shot = async (p, name) => {
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` });
};
async function step(name, fn, p = page) {
  const t = Date.now();
  try {
    const r = await fn();
    results.push({ name, ok: true, ms: Date.now() - t, note: r ?? '' });
    log('OK  ', name, `(${Date.now() - t} ms)`, r ?? '');
  } catch (e) {
    results.push({ name, ok: false, note: e.message.split('\n')[0] });
    log('FAIL', name, e.message.split('\n')[0]);
    await shot(p, 'FAIL').catch(() => {});
    await p.keyboard.press('Escape').catch(() => {});
  }
}
const inViewport = async (loc) => {
  const b = await loc.boundingBox();
  return !!b && b.y >= 0 && b.y + b.height <= 900 && b.x >= 0 && b.x + b.width <= 1440;
};

// ── ۰:۰۰ problem
await step('0:00 empty state + mascot', async () => {
  await page.goto(BASE + '/');
  await page.locator('[data-ready]').waitFor();
  await expect(tid(page, 'empty-state')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await shot(page, 'empty');
});

// ── ۰:۲۰ step 1
await step('0:20 mic → waveform → transcript auto-sends', async () => {
  await tid(page, 'prompt-action').click();
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10000 });
  await shot(page, 'mic-wave');
  await expect(tid(page, 'prompt-input')).toHaveValue('یه هندزفری بی‌سیم می‌خوام', { timeout: 5000 });
  await shot(page, 'mic-transcript');
  await expect(tid(page, 'user-bubble').first()).toBeVisible({ timeout: 5000 });
  return await tid(page, 'user-bubble').first().innerText();
});
await step('0:20 one question with quick replies incl. «ورزش»', async () => {
  await expect(tid(page, 'question').first()).toBeVisible({ timeout: 45000 });
  const replies = await tid(page, 'quick-reply').allInnerTexts();
  await shot(page, 'q1');
  if (!replies.includes('ورزش')) throw new Error('no ورزش in ' + JSON.stringify(replies));
  return (await tid(page, 'question').first().innerText()).split('\n')[0] + ' ' + JSON.stringify(replies);
});
await step('0:20 «ورزش» → comparison cards (image, price range, shops, why)', async () => {
  await tid(page, 'quick-reply').filter({ hasText: /^ورزش$/ }).click();
  await expect(tid(page, 'product-card').first()).toBeVisible({ timeout: 45000 });
  await page.waitForTimeout(800);
  const c = tid(page, 'product-card').first();
  const txt = (await c.innerText()).replace(/\s+/g, ' ');
  const img = await c.locator('img').count();
  const why = await tid(page, 'why').count();
  await shot(page, 'cards');
  if (!img || !why || !/فروشگاه/.test(txt) || !/میلیون/.test(txt)) throw new Error(`card incomplete img=${img} why=${why}: ${txt.slice(0, 200)}`);
  return JSON.stringify(await tid(page, 'product-card').evaluateAll((e) => e.map((x) => x.innerText.split('\n')[0].slice(0, 40))));
});
await step('0:20 spec-diff table', async () => {
  await expect(tid(page, 'spec-diff').last()).toBeVisible();
  await tid(page, 'spec-diff').last().scrollIntoViewIfNeeded();
  await shot(page, 'spec-diff');
  return (await tid(page, 'spec-diff').last().innerText()).replace(/\s+/g, ' ').slice(0, 160);
});
await step('0:20 «دقیق‌ترش کن» → budget question → «زیر ۵ میلیون»', async () => {
  await tid(page, 'enough-refine').click();
  await expect(tid(page, 'question')).toHaveCount(2, { timeout: 45000 });
  const q = (await tid(page, 'question').nth(1).innerText()).split('\n')[0];
  const r = tid(page, 'question').nth(1).getByTestId('quick-reply');
  const labels = await r.allInnerTexts();
  await shot(page, 'q2-budget');
  if (!/قیمت|بودجه/.test(q)) throw new Error('second question is not budget: ' + q);
  const five = r.filter({ hasText: 'زیر ۵ میلیون' });
  if (!(await five.count())) throw new Error('no «زیر ۵ میلیون»: ' + JSON.stringify(labels));
  await five.click();
  await expect(tid(page, 'compare-cards')).toHaveCount(2, { timeout: 45000 });
  await page.waitForTimeout(800);
  await shot(page, 'cards-under5');
  return q + ' ' + JSON.stringify(labels);
});
// drag a budget thumb (a range input) to ~target, as a pointer drag would: native setter + input event
async function setBudget(label, target) {
  await tid(page, 'crit-budget').click();
  const sheet = page.getByRole('dialog', { name: 'بودجه' });
  await expect(sheet).toBeVisible();
  const fits = await inViewport(sheet);
  await sheet.getByLabel(label).evaluate((el, t) => {
    const lo = Number(el.min);
    const step = Number(el.step);
    const v = Math.min(Number(el.max), lo + Math.max(0, Math.round((t - lo) / step)) * step);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, target);
  await page.waitForTimeout(300);
  const text = (await sheet.innerText()).replace(/\s+/g, ' ').match(/از .+? تا .+? تومان/)?.[0];
  await shot(page, 'budget-' + target);
  await sheet.getByRole('button', { name: 'اعمال' }).click();
  await page.waitForTimeout(800);
  if (!fits) throw new Error('budget popover off-screen');
  return text;
}
await step('0:20 budget chip: «تا» → ۳ میلیون filters instantly, back to ۵ restores', async () => {
  const label = (await tid(page, 'crit-budget').innerText()).trim();
  const cardsBox = () => tid(page, 'compare-cards').last();
  const before = await cardsBox().getByTestId('product-card').count();
  const t1 = await setBudget('حداکثر بودجه', 3_000_000);
  const mid = await cardsBox().getByTestId('product-card').count();
  const goneMid = !(await cardsBox().innerText()).includes(DEMO_PRODUCT);
  const t2 = await setBudget('حداکثر بودجه', 5_000_000);
  const after = await cardsBox().getByTestId('product-card').count();
  const back = (await cardsBox().innerText()).includes(DEMO_PRODUCT);
  await shot(page, 'budget-restored');
  if (!(mid < before) || !goneMid) throw new Error(`no instant filter: ${before}→${mid}`);
  if (!back) throw new Error('demo product did not come back');
  return `chip="${label}" «${t1}» cards ${before}→${mid} · «${t2}» → ${after}`;
});

// ── ۱:۳۵ signature moment
await step('1:35 choose card → pinned + map; tap pinned → back; choose again', async () => {
  const card = () => tid(page, 'compare-cards').last().getByTestId('product-card').filter({ hasText: DEMO_PRODUCT }).first();
  const title = await card().evaluate((e) => e.innerText.split('\n')[0]);
  await card().getByTestId('choose-product').click();
  await page.waitForURL(/\/p\//);
  await expect(tid(page, 'pinned-product')).toBeVisible();
  await expect(tid(page, 'map')).toBeVisible();
  await page.waitForTimeout(900);
  await shot(page, 'pinned');
  await tid(page, 'pinned-product').click();
  await page.waitForTimeout(900);
  const back = !/\/p\//.test(page.url());
  await shot(page, 'pinned-back');
  if (back) {
    await card().getByTestId('choose-product').click();
    await page.waitForURL(/\/p\//);
  }
  await expect(tid(page, 'shop-card').first()).toBeVisible({ timeout: 30000 });
  if (await tid(page, 'keep-default').isVisible().catch(() => false)) await tid(page, 'keep-default').click();
  if (!back) throw new Error('tapping the pinned card did not go back');
  return title.slice(0, 50);
});

// ── ۱:۵۰ map + shops
await step('1:50 map: user dot, pins, heat/rings', async () => {
  await page.waitForTimeout(1500);
  const dot = await page.locator('.user-dot').count();
  const pins = await page.locator('[data-testid="map-pin"]').count();
  const clusters = await page.locator('[data-testid="map-cluster"]').count();
  await shot(page, 'map');
  if (!dot || !(pins + clusters)) throw new Error(`dot=${dot} pins=${pins} clusters=${clusters}`);
  return `dot=${dot} pins=${pins} clusters=${clusters}`;
});
await step('1:50 top-3 inquiries start («در حال استعلام از فروشنده…»)', async () => {
  const p = page.getByText('در حال استعلام از فروشنده');
  await expect(p.first()).toBeVisible({ timeout: 20000 });
  await shot(page, 'inquiring');
  return `${await p.count()} pending`;
});
await step('1:50 sort chips «پیشنهاد ما» → «نزدیک‌ترین» → «ارزان‌ترین»', async () => {
  const ids = () => tid(page, 'shop-card').evaluateAll((els) => els.slice(0, 5).map((e) => e.getAttribute('data-shop-id')));
  const best = await ids();
  await tid(page, 'sort-nearest').click();
  await page.waitForTimeout(700);
  const near = await ids();
  await tid(page, 'sort-cheapest').click();
  await page.waitForTimeout(700);
  const cheap = await ids();
  await shot(page, 'sorted-cheapest');
  await tid(page, 'sort-best').click();
  await page.waitForTimeout(600);
  const first = (await tid(page, 'shop-card').first().innerText()).split('\n')[0];
  const differ = JSON.stringify(best) !== JSON.stringify(near) || JSON.stringify(near) !== JSON.stringify(cheap);
  if (!differ) throw new Error('sorting did not change the order');
  return `best#1=${first}`;
});
await step('1:50 tap a pin → its card highlights', async () => {
  const pin = page.locator('[data-testid="map-pin"]:not([data-shop-id=""])').first();
  const id = await pin.getAttribute('data-shop-id');
  await pin.click({ force: true });
  await page.waitForTimeout(900);
  const cls = await page.locator(`[data-testid="shop-card"][data-shop-id="${id}"]`).getAttribute('class');
  await shot(page, 'pin-highlight');
  if (!/border-accent/.test(cls ?? '')) throw new Error('card not highlighted for ' + id);
  return id;
});
await step('1:50 listed price + «ممکن است تغییر کرده باشد · N روز پیش»', async () => {
  const t = (await tid(page, 'shop-list').innerText()).replace(/\s+/g, ' ');
  const m = t.match(/ممکن است تغییر کرده باشد · \S+ روز پیش/);
  if (!m) throw new Error('freshness label not found');
  return m[0];
});
await step('1:50 «اقساطی» chip', async () => {
  const before = await tid(page, 'shop-card').count();
  await tid(page, 'crit-installment').click();
  await page.waitForTimeout(900);
  const after = await tid(page, 'shop-card').count();
  const relax = await tid(page, 'relaxation').isVisible().catch(() => false);
  await shot(page, 'installment');
  let note = `cards ${before}→${after} relaxation=${relax}`;
  if (relax) {
    note += ' «' + (await tid(page, 'relaxation').innerText()).replace(/\s+/g, ' ') + '»';
    await tid(page, 'relax-apply').click();
  }
  await tid(page, 'crit-installment').click();
  await page.waitForTimeout(500);
  return note;
});

// ── ۲:۵۰ find the shop
await step(`2:50 open ${DEMO_SHOP}: pasaj/floor/unit chips, ETA, hours`, async () => {
  await tid(page, 'shop-card').filter({ hasText: DEMO_SHOP }).first().click({ force: true });
  await page.waitForURL(/\/s\//);
  await expect(tid(page, 'shop-detail')).toBeVisible();
  await page.waitForTimeout(800);
  const all = await tid(page, 'shop-detail').innerText();
  await shot(page, 'detail');
  for (const w of ['پاساژ تجارت جهانی', 'طبقه', 'واحد', 'ساعات کاری']) if (!all.includes(w)) throw new Error('missing ' + w);
  return all.split('\n').slice(0, 12).join(' | ') + ' · eta=' + (await tid(page, 'eta').innerText()).replace(/\s+/g, ' ');
});
await step('2:50 3D view opens on the shop floor; floor chips work', async () => {
  await tid(page, 'open-mall').click();
  await expect(tid(page, 'mall-overlay')).toBeVisible();
  await expect(tid(page, 'floor-chip').first()).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(2500);
  const sel = await page.locator('[role=tablist] [aria-selected=true]').innerText();
  await shot(page, 'mall');
  const clip = { x: 300, y: 150, width: 800, height: 500 };
  const isolated = await page.screenshot({ clip });
  const note = (await tid(page, 'mall-overlay').innerText()).includes('شماتیک');
  await page.locator('[role=tablist] [role=tab]').filter({ hasText: 'همه' }).click();
  await page.waitForTimeout(1200);
  await shot(page, 'mall-all');
  const all = await page.screenshot({ clip });
  if (isolated.equals(all)) throw new Error('floor isolation is not visible (same pixels as «همه»)');
  await tid(page, 'floor-chip').filter({ hasText: /^۳$/ }).click();
  await page.waitForTimeout(800);
  if (sel !== '۳') throw new Error('opened on «' + sel + '» instead of ۳');
  if (!note) throw new Error('no «شماتیک» note');
  return `opened on ${sel}`;
});
await step('2:50 «بازگشت به نقشه» → «پیدا کردنش سخته؟» → «کدوم طبقه؟»', async () => {
  await tid(page, 'mall-exit').click();
  await expect(tid(page, 'mall-overlay')).toHaveCount(0);
  await tid(page, 'find-help').click();
  await expect(tid(page, 'find-help-sheet')).toBeVisible();
  await page.getByRole('button', { name: 'کدوم طبقه؟' }).click();
  await expect(tid(page, 'find-help-answer')).toBeVisible({ timeout: 25000 });
  await shot(page, 'find-help');
  const a = (await tid(page, 'find-help-answer').innerText()).replace(/\s+/g, ' ');
  await page.keyboard.press('Escape');
  return a;
});

// ── ۳:۳۰ step 4
await step('3:30 timeline; one turns green «تأیید شده»', async () => {
  await expect(tid(page, 'inquiry-timeline')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('تأیید شده').first()).toBeVisible({ timeout: 40000 });
  await shot(page, 'verified');
  return (await tid(page, 'inquiry-timeline').innerText()).replace(/\s+/g, ' ');
});
await step('3:30 «استعلام از فروشگاه» → «برام کنار می‌ذارید؟» → send (on screen)', async () => {
  await tid(page, 'ask-shop').click();
  await expect(tid(page, 'ask-sheet')).toBeVisible();
  await page.getByRole('button', { name: 'برام کنار می‌ذارید؟' }).click();
  await page.waitForTimeout(500);
  const vis = await inViewport(tid(page, 'ask-submit'));
  await shot(page, 'ask-popover');
  if (!vis) throw new Error('send button off-screen: ' + JSON.stringify(await tid(page, 'ask-submit').boundingBox()));
  await tid(page, 'ask-submit').click();
  await page.waitForTimeout(2500);
  let note = 'sent';
  if (await tid(page, 'data-answer').isVisible().catch(() => false)) {
    note = 'data-answer: ' + (await tid(page, 'data-answer').innerText()).replace(/\s+/g, ' ');
    await page.getByText('باز هم از خود فروشنده بپرس').click();
    await page.waitForTimeout(1000);
  }
  await shot(page, 'asked');
  return note;
});
// the owner's window: its own context (a real clock; the shopper's clock is pinned to noon)
const inbox = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fa-IR', timezoneId: 'Asia/Tehran' })).newPage();
inbox.setDefaultTimeout(15000);
await step(
  '3:30 /shop: banner, inquiry arrived, «تموم شده» without typing',
  async () => {
    await inbox.goto(BASE + '/shop');
    await expect(tid(inbox, 'shop-index-item').first()).toBeVisible({ timeout: 20000 });
    const banner = await tid(inbox, 'auto-reply-banner').innerText().catch(() => '(none)');
    await shot(inbox, 'inbox-index');
    await tid(inbox, 'shop-index-item').filter({ hasText: DEMO_SHOP }).first().click();
    await expect(tid(inbox, 'inbox-card').first()).toBeVisible();
    const card = (await tid(inbox, 'inbox-card').first().innerText()).replace(/\s+/g, ' ');
    await shot(inbox, 'inbox-card');
    await tid(inbox, 'reply-oos').first().click();
    await expect(tid(inbox, 'inbox-card')).toHaveCount(0, { timeout: 10000 });
    await shot(inbox, 'inbox-done');
    if (banner.includes('manual=1')) throw new Error('banner still shows ?manual=1');
    return `banner=«${banner}» card=${card.slice(0, 140)}`;
  },
  inbox,
);
await step('3:30 shopper: «ناموجود» + notice with nearest verified alternative → tap it', async () => {
  await page.bringToFront();
  const notice = tid(page, 'notice-out_of_stock');
  await expect(notice).toBeVisible({ timeout: 20000 });
  const txt = (await notice.innerText()).replace(/\s+/g, ' ');
  const detail = await tid(page, 'shop-detail').innerText().catch(() => '');
  await shot(page, 'oos');
  const btn = notice.locator('button, a').first();
  if (!(await btn.count())) throw new Error('notice has no action: ' + txt);
  await btn.click();
  await page.waitForTimeout(1500);
  await shot(page, 'alt-shop');
  const now = (await tid(page, 'shop-detail').innerText().catch(() => '')).split('\n')[0];
  return `notice=«${txt}» detail-shows-oos=${/ناموجود|تموم/.test(detail)} → ${now}`;
});
await step('3:30 «مغازه بسته بود» → open nearby list', async () => {
  await tid(page, 'shop-closed').scrollIntoViewIfNeeded();
  await tid(page, 'shop-closed').click();
  await expect(tid(page, 'closed-flow')).toBeVisible();
  await shot(page, 'closed');
  return (await tid(page, 'closed-flow').innerText()).replace(/\s+/g, ' ').slice(0, 220);
});

// ── ۴:۴۵ wrap-up
await step('4:45 back to home + mascot', async () => {
  await page.goto(BASE + '/');
  await page.locator('[data-ready]').waitFor();
  await shot(page, 'end');
});

fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, results, errors }, null, 1));
const ok = results.filter((r) => r.ok).length;
log('SUMMARY', ok, '/', results.length, 'ok; pageerrors', JSON.stringify(errors));
await browser.close();
process.exit(ok === results.length ? 0 : 1);
