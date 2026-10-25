// Stage-by-stage trace of one chat turn (or a short conversation).
//   npm run trace -- "<query>" [--after "<earlier message>"]… [--budget <max toman>] [--url <base>] [--json]
// Local: runs the pipeline in-process on data/app.sqlite with .env.local (live LLM if a key is set).
// --url: POSTs to <base>/api/chat with x-debug-trace = PROD_SHOP_TOKEN_SECRET (or SHOP_TOKEN_SECRET) from .env.local.
import fs from 'node:fs';
import path from 'node:path';

type Ev = { stage: string; ms: number; data: Record<string, unknown> };
type Resp = { blocks: { type: string; products?: { title: string; category: string }[]; question?: string; text?: string }[]; state: unknown; mode: string; trace?: Ev[] };

const argv = process.argv.slice(2);
const opt = (k: string) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv.splice(i, 2)[1] : undefined;
};
const after: string[] = [];
for (let v = opt('--after'); v !== undefined; v = opt('--after')) after.push(v);
const url = opt('--url');
const budget = opt('--budget');
const asJson = argv.includes('--json') ? (argv.splice(argv.indexOf('--json'), 1), true) : false;
const query = argv.join(' ').trim();
if (!query) {
  console.error('usage: npm run trace -- "<query>" [--after "<earlier>"] [--budget N] [--url <base>] [--json]');
  process.exit(2);
}

const envLocal: Record<string, string> = {};
if (fs.existsSync('.env.local'))
  for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) envLocal[m[1]] = m[2];
  }
const criteria = { budget: { min: null, max: budget ? Number(budget) : null }, distanceKm: null, installment: false, openNow: false };

async function turnRemote(messages: { role: string; text: string }[], state: unknown): Promise<Resp> {
  const secret = envLocal.PROD_SHOP_TOKEN_SECRET || envLocal.SHOP_TOKEN_SECRET || 'dev-secret-change-me';
  const r = await fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-debug-trace': url!.includes('localhost') ? envLocal.SHOP_TOKEN_SECRET || 'dev-secret-change-me' : secret },
    body: JSON.stringify({ messages, ...(state ? { state } : {}), criteria }),
  });
  return r.json();
}

let local: ((m: { role: 'user' | 'assistant'; text: string }[], s: unknown) => Promise<Resp>) | null = null;
async function turnLocal(messages: { role: 'user' | 'assistant'; text: string }[], state: unknown): Promise<Resp> {
  if (!local) {
    Object.assign(process.env, envLocal, { DATA_SOURCE: 'sqlite', SQLITE_PATH: path.resolve('data/app.sqlite'), LLM_MODE: process.env.LLM_MODE ?? 'auto' });
    const { runChat } = await import('../src/lib/agent/pipeline');
    const { withTrace } = await import('../src/lib/trace');
    const { INITIAL_CHAT_STATE } = await import('../src/lib/agent/blocks');
    local = async (m, s) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { result, trace } = await withTrace(() => runChat({ messages: m, state: (s ?? INITIAL_CHAT_STATE) as any, criteria }));
      return { ...(result as Resp), trace: trace as Ev[] };
    };
  }
  return local(messages, state);
}

function show(r: Resp) {
  if (asJson) return console.log(JSON.stringify(r.trace, null, 1));
  for (const e of r.trace ?? []) {
    const d = e.data;
    const h = `  [${String(e.ms).padStart(5)} ms] ${e.stage}`;
    if (e.stage === 'llm') {
      console.log(`${h}  ${d.call} → ${d.path}${d.model ? ` (${d.model}, attempt ${d.attempt}, ${d.ms} ms, ok=${d.ok})` : ''}${d.why ? `  why: ${d.why}` : ''}`);
      if (d.raw) console.log(`             raw: ${JSON.stringify(d.raw).slice(0, 700)}`);
    } else if (e.stage === 'search') {
      console.log(`${h}  [${d.source}] «${d.text}» groups=${JSON.stringify(d.groups)} types=${JSON.stringify(d.types)} filters=${JSON.stringify(d.filters)}`);
      for (const st of d.stages as { mode: string; fts: string; rows: number }[]) console.log(`             ${st.mode.padEnd(16)} rows=${String(st.rows).padStart(5)}  MATCH ${st.fts}`);
      for (const [i, t] of (d.top as Record<string, unknown>[]).entries())
        console.log(
          `             ${String(i + 1).padStart(2)}. ${String(t.final).padStart(6)}  cov=${t.coverage} model=${t.modelTokens} phrase=${t.phrase} var=${t.variant} head=${t.head} acc=${t.accessory} type=${t.type} pop=${t.pop} shops=${t.shopCount} bm25=${t.bm25}  ${String(t.title).slice(0, 60)} [${t.category}]`,
        );
    } else if (e.stage === 'candidates') {
      console.log(`${h}  «${d.text}» ${JSON.stringify(d.counts)} filters=${JSON.stringify(d.filters)}`);
      for (const t of (d.top as string[]).slice(0, 6)) console.log(`             · ${t}`);
    } else if (e.stage === 'pick') {
      console.log(`${h}  source=${d.source} llmPickIds=${JSON.stringify(d.llmPickIds)} valid=${d.validLlmPicks}`);
      for (const t of d.final as string[]) console.log(`             → ${t}`);
    } else console.log(`${h}  ${JSON.stringify(d).slice(0, 600)}`);
  }
  const p = r.blocks.find((b) => b.type === 'products');
  const q = r.blocks.find((b) => b.type === 'question');
  console.log(`  ANSWER (${r.mode}): ${p ? p.products!.map((x) => `${x.title.slice(0, 50)} [${x.category}]`).join(' | ') : q ? `question: ${q.question}` : r.blocks.map((b) => b.text ?? b.type).join(' / ')}`);
}

async function main() {
  const turns = [...after, query];
  const messages: { role: 'user' | 'assistant'; text: string }[] = [];
  let state: unknown = null;
  for (const [i, t] of turns.entries()) {
    messages.push({ role: 'user', text: t });
    const r = url ? await turnRemote(messages, state) : await turnLocal(messages, state);
    if (!r.trace) {
      console.error('no trace in the response (wrong secret, or the server predates x-debug-trace)');
      process.exit(1);
    }
    state = r.state;
    const q = r.blocks.find((b) => b.type === 'question');
    if (q?.question) messages.push({ role: 'assistant', text: q.question });
    if (i === turns.length - 1 || asJson) {
      console.log(`\n=== «${t}»${budget ? ` (budget ≤ ${budget})` : ''} @ ${url ?? 'local'} ===`);
      show(r);
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
