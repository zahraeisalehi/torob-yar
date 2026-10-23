/* npm run smoke -- --url https://<app>.liara.run   (defaults to http://localhost:3000) */
import fs from 'node:fs';
import path from 'node:path';

const argUrl = process.argv.indexOf('--url');
const BASE = (argUrl > 0 ? process.argv[argUrl + 1] : process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

type Row = { step: string; ok: boolean; ms: number; detail: string };
const rows: Row[] = [];

async function step(name: string, fn: () => Promise<string>) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    rows.push({ step: name, ok: true, ms: Date.now() - t0, detail });
  } catch (e) {
    rows.push({ step: name, ok: false, ms: Date.now() - t0, detail: e instanceof Error ? e.message : String(e) });
  }
  const r = rows.at(-1)!;
  console.log(`${r.ok ? '✓' : '✗'} ${name} (${r.ms} ms) ${r.detail}`);
}

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(60_000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status} ${JSON.stringify(body).slice(0, 120)}`);
  return body as T;
}

type Block = { type: string; products?: { id: string }[]; replies?: string[]; question?: string };
type ChatRes = { blocks: Block[]; state: unknown; mode: string };

async function main() {
  console.log(`smoke → ${BASE}\n`);
  let productId = '';
  let complexId = '';
  let shopId = '';

  await step('GET /api/health', async () => {
    const h = await j<{ ok: boolean; dataSource: string; llmMode: string; stt: boolean; counts: { products: number } }>('/api/health');
    if (!h.ok || !h.counts.products) throw new Error(JSON.stringify(h));
    return `${h.dataSource}, llm=${h.llmMode}, stt=${h.stt}, products=${h.counts.products}`;
  });

  await step('POST /api/chat (S25 FE)', async () => {
    const messages = [{ role: 'user', text: 'گوشی سامسونگ S25 FE' }];
    let r = await j<ChatRes>('/api/chat', { method: 'POST', body: JSON.stringify({ messages }) });
    let products = r.blocks.find((b) => b.type === 'products');
    if (!products) {
      const q = r.blocks.find((b) => b.type === 'question');
      if (!q?.replies?.length) throw new Error('neither products nor a question');
      r = await j<ChatRes>('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ messages: [...messages, { role: 'assistant', text: q.question }, { role: 'user', text: q.replies[0] }], state: r.state }),
      });
      products = r.blocks.find((b) => b.type === 'products');
    }
    if (!products?.products || products.products.length < 2) throw new Error('fewer than 2 products');
    productId = products.products[0].id;
    return `${products.products.length} products (${r.mode})`;
  });

  await step('GET /api/products/:id/offers', async () => {
    const r = await j<{ offers: { shopId: string; shop: { complex?: { id: string } } }[] }>(`/api/products/${productId}/offers`);
    if (r.offers.length < 10) throw new Error(`only ${r.offers.length} offers`);
    complexId = r.offers.find((o) => o.shop.complex)?.shop.complex?.id ?? '';
    shopId = r.offers[0].shopId;
    return `${r.offers.length} offers`;
  });

  await step('GET /api/complex/:id', async () => {
    if (!complexId) throw new Error('no complex among offers');
    const r = await j<{ shops: unknown[] }>(`/api/complex/${complexId}?productId=${productId}`);
    if (r.shops.length <= 5) throw new Error(`only ${r.shops.length} shops`);
    return `${r.shops.length} shops`;
  });

  await step('inquiry round trip (AUTO_REPLY)', async () => {
    const { inquiry } = await j<{ inquiry: { id: string } }>('/api/inquiries', { method: 'POST', body: JSON.stringify({ shopId, productId }) });
    const t0 = Date.now();
    while (Date.now() - t0 < 30_000) {
      const r = await j<{ inquiries: { status: string; outcome: string }[] }>(`/api/inquiries?ids=${inquiry.id}`);
      if (r.inquiries[0]?.status === 'replied') return `replied: ${r.inquiries[0].outcome}`;
      await new Promise((res) => setTimeout(res, 1500));
    }
    throw new Error('no reply within 30 s (is AUTO_REPLY=1?)');
  });

  await step('POST /api/transcribe', async () => {
    const file = path.join(__dirname, 'fixtures/fa-sample.webm');
    if (!fs.existsSync(file)) throw new Error('scripts/fixtures/fa-sample.webm missing (run npm run doctor)');
    const fd = new FormData();
    fd.append('file', new File([fs.readFileSync(file)], 'audio.webm', { type: 'audio/webm' }));
    fd.append('mime', 'audio/webm');
    const res = await fetch(BASE + '/api/transcribe', { method: 'POST', body: fd, signal: AbortSignal.timeout(40_000) });
    const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
    if (res.status === 503) return `disabled (${body.error}) — UI falls back to browser speech`;
    if (!res.ok) throw new Error(`HTTP ${res.status} ${body.error ?? ''}`);
    return `text: «${(body.text ?? '').slice(0, 40)}»`;
  });

  await step('GET / (rtl)', async () => {
    const res = await fetch(BASE + '/', { signal: AbortSignal.timeout(30_000) });
    const html = await res.text();
    if (!res.ok || !html.includes('dir="rtl"')) throw new Error(`HTTP ${res.status}`);
    return 'dir="rtl"';
  });

  console.log('\n┌─────────────────────────────────────┬────┬─────────┐');
  for (const r of rows) console.log(`│ ${r.step.padEnd(35)} │ ${r.ok ? ' ✓ ' : ' ✗ '}│ ${String(r.ms).padStart(5)} ms │`);
  console.log('└─────────────────────────────────────┴────┴─────────┘');
  if (rows.some((r) => !r.ok)) process.exit(1);
}

main();
