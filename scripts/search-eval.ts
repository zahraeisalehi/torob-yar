// Retrieval eval on the real catalogue (data/app.sqlite).
//   npx tsx --conditions=react-server scripts/search-eval.ts [--verbose] [--no-gate] [--no-pipeline]
// Every query comes from real catalogue titles. A result "hits" when it satisfies the case's title
// and/or category predicate (so duplicate listings of the same model all count).
// Gates: top-3 ≥ 90%, top-1 ≥ 75% (exit 1 below). Part 2 runs the agent pipeline (scripted LLM).
import fs from 'node:fs';
import path from 'node:path';

type Case = { q: string; kind: 'latin' | 'persian' | 'mixed' | 'typo' | 'generic'; title?: RegExp[]; cat?: RegExp };

const C = {
  phones: /^گوشی موبایل$/,
  audio: /^هدفون، هدست و هندزفری$/,
  speaker: /^اسپیکر و سیستم صوتی$/,
  charger: /^شارژر گوشی$/,
  power: /پاوربانک/,
  shaver: /ماشین اصلاح/,
  cctv: /^دوربین مدار بسته$/,
  watch: /ساعت و مچ بند هوشمند/,
  laptop: /لپ تاپ و نوت بوک/,
  typec: /Type C/,
  mousekb: /ست ماوس و کیبورد/,
  cover: /^کیف و کاور گوشی$/,
  battery: /^باتری گوشی موبایل$/,
  glass: /محافظ صفحه نمایش/,
};
const t = (...r: RegExp[]) => r;

export const CASES: Case[] = [
  // exact model names in Latin
  { q: 'redmi buds 8 active', kind: 'latin', title: t(/redmi buds 8 active/i), cat: C.audio },
  { q: 'galaxy s25 fe 256', kind: 'latin', title: t(/s25 fe/i, /256/), cat: C.phones },
  { q: 'iphone 16 pro max', kind: 'latin', title: t(/(16 pro max|16 پرو مکس)/i), cat: C.phones },
  { q: 'poco x7 pro', kind: 'latin', title: t(/poco x7 pro/i), cat: C.phones },
  { q: 'jbl flip 6', kind: 'latin', title: t(/flip 6/i), cat: C.speaker },
  { q: 'galaxy a56', kind: 'latin', title: t(/a56/i), cat: C.phones },
  { q: 'redmi note 14', kind: 'latin', title: t(/redmi note 14/i), cat: C.phones },
  { q: 'anker soundcore r50i', kind: 'latin', title: t(/r50i/i), cat: C.audio },
  { q: 'qcy t13', kind: 'latin', title: t(/t13/i), cat: C.audio },
  { q: 'galaxy watch 7', kind: 'latin', title: t(/watch ?7/i), cat: C.watch },
  { q: 'sony wh-1000xm5', kind: 'latin', title: t(/1000xm5/i), cat: C.audio },
  // Persian
  { q: 'ایرپاد پرو ۲', kind: 'persian', title: t(/(ایرپاد پرو 2|airpods pro 2)/i), cat: C.audio },
  { q: 'شارژر ۲۰ وات اپل', kind: 'persian', title: t(/20 ?(وات|w)/i, /(اپل|apple)/i), cat: C.charger },
  { q: 'پاوربانک شیائومی ۲۰۰۰۰', kind: 'persian', title: t(/20000/, /(شیائومی|xiaomi)/i), cat: C.power },
  { q: 'ماشین اصلاح فیلیپس', kind: 'persian', title: t(/(فیلیپس|philips)/i), cat: C.shaver },
  { q: 'دوربین مداربسته هایک ویژن', kind: 'persian', title: t(/(هایک ?ویژن|hikvision)/i), cat: C.cctv },
  { q: 'ساعت هوشمند سامسونگ', kind: 'persian', title: t(/(سامسونگ|samsung)/i), cat: C.watch },
  { q: 'هدفون سونی', kind: 'persian', title: t(/(سونی|sony)/i), cat: C.audio },
  { q: 'کابل شارژ تایپ سی', kind: 'persian', cat: C.typec },
  { q: 'ست ماوس و کیبورد لاجیتک', kind: 'persian', title: t(/(لاجیتک|logitech)/i), cat: C.mousekb },
  { q: 'ردمی بادز ۸ اکتیو', kind: 'persian', title: t(/redmi buds 8 active/i), cat: C.audio },
  { q: 'ردمی نوت ۱۴', kind: 'persian', title: t(/redmi note 14/i), cat: C.phones },
  // mixed Persian + Latin
  { q: 'گوشی Galaxy S25 Ultra', kind: 'mixed', title: t(/s25 (ultra|اولترا)/i), cat: C.phones },
  { q: 'هندزفری Redmi Buds 6 Play', kind: 'mixed', title: t(/buds 6 play/i), cat: C.audio },
  { q: 'ایرپاد pro 3', kind: 'mixed', title: t(/(پرو 3|pro 3)/i), cat: C.audio },
  { q: 'اسپیکر JBL Charge 5', kind: 'mixed', title: t(/charge 5/i), cat: C.speaker },
  { q: 'لپ تاپ لنوو Legion 5', kind: 'mixed', title: t(/legion 5/i), cat: C.laptop },
  { q: 'پاوربانک Baseus 30000', kind: 'mixed', title: t(/30000/, /(باسئوس|baseus)/i), cat: C.power },
  { q: 'گوشی سامسونگ a56', kind: 'mixed', title: t(/a56/i), cat: C.phones },
  // typos and spacing
  { q: 'redmy buds 8 active', kind: 'typo', title: t(/redmi buds 8 active/i), cat: C.audio },
  { q: 'samsong galaxy s25 fe', kind: 'typo', title: t(/s25 fe/i), cat: C.phones },
  { q: 'iphon 16 pro max', kind: 'typo', title: t(/(16 pro max|16 پرو مکس)/i), cat: C.phones },
  { q: 'jbl flip6', kind: 'typo', title: t(/flip 6/i), cat: C.speaker },
  { q: 'گوشی ساسمونگ a56', kind: 'typo', title: t(/a56/i), cat: C.phones },
  // generic needs (category correctness)
  { q: 'هندزفری بی‌سیم ورزشی', kind: 'generic', cat: C.audio },
  { q: 'گوشی ارزون سامسونگ', kind: 'generic', title: t(/(سامسونگ|samsung)/i), cat: C.phones },
  { q: 'اسپیکر بلوتوثی قابل حمل', kind: 'generic', cat: C.speaker },
  { q: 'شارژر فست گوشی', kind: 'generic', cat: C.charger },
  { q: 'هدفون گیمینگ', kind: 'generic', cat: C.audio },
  // accessories asked for explicitly must still win
  { q: 'کاور گوشی آیفون ۱۶', kind: 'generic', title: t(/16/), cat: C.cover },
  { q: 'باتری گوشی سامسونگ', kind: 'generic', cat: C.battery },
  { q: 'گلس گوشی s25 fe', kind: 'generic', title: t(/s25 fe/i), cat: C.glass },
];

/** Multi-turn agent checks: the last turn's products must contain a hit. */
const PIPELINE: { turns: string[]; title: RegExp; cat: RegExp }[] = [
  { turns: ['گوشی سامسونگ S25 FE', 'redmi buds 8 active'], title: /redmi buds 8 active/i, cat: C.audio },
  { turns: ['گوشی شیائومی', 'اقتصادی', 'jbl flip 6'], title: /flip 6/i, cat: C.speaker },
  { turns: ['redmi buds 8 active'], title: /redmi buds 8 active/i, cat: C.audio },
];

type P = { id: string; title: string; category: string };
const hit = (c: { title?: RegExp[]; cat?: RegExp }, p: P) => (!c.title || c.title.every((r) => r.test(p.title))) && (!c.cat || c.cat.test(p.category));

async function main() {
  const args = new Set(process.argv.slice(2));
  const db = path.resolve('data/app.sqlite');
  if (!fs.existsSync(db)) {
    console.log('search-eval: data/app.sqlite missing (npm run build:db) — skipped');
    return;
  }
  const { createSqliteSource } = await import('../src/lib/data/sqlite');
  const src = createSqliteSource(db);
  let t1 = 0;
  let t3 = 0;
  let catOk = 0;
  let catN = 0;
  const fails: string[] = [];
  const byKind: Record<string, { n: number; t1: number; t3: number }> = {};
  for (const c of CASES) {
    const res = (await src.searchProducts({ text: c.q, limit: 5 })) as P[];
    const top1 = !!res[0] && hit(c, res[0]);
    const top3 = res.slice(0, 3).some((p) => hit(c, p));
    t1 += +top1;
    t3 += +top3;
    const k = (byKind[c.kind] ??= { n: 0, t1: 0, t3: 0 });
    k.n++;
    k.t1 += +top1;
    k.t3 += +top3;
    if (c.cat) {
      catN += 3;
      catOk += res.slice(0, 3).filter((p) => c.cat!.test(p.category)).length;
    }
    if (!top1) fails.push(`${top3 ? '·' : '✗'} ${c.q}  →  ${res[0] ? `${res[0].title.slice(0, 60)} [${res[0].category}]` : '(nothing)'}`);
    if (args.has('--verbose')) console.log(`${top1 ? '✓' : top3 ? '·' : '✗'} ${c.q}\n${res.slice(0, 3).map((p, i) => `    ${i + 1}. ${p.title.slice(0, 70)} [${p.category}]`).join('\n')}`);
  }
  const n = CASES.length;
  const pct = (x: number, d = n) => `${Math.round((100 * x) / d)}%`;
  console.log(`\nsearch-eval: ${n} queries · top-1 ${pct(t1)} (${t1}) · top-3 ${pct(t3)} (${t3}) · category in top-3 ${pct(catOk, catN)}`);
  console.log(Object.entries(byKind).map(([k, v]) => `  ${k.padEnd(8)} n=${v.n} top-1 ${pct(v.t1, v.n)} top-3 ${pct(v.t3, v.n)}`).join('\n'));
  if (fails.length) console.log('misses at top-1 (· = in top-3):\n  ' + fails.join('\n  '));

  let pipeOk = true;
  if (!args.has('--no-pipeline')) {
    process.env.LLM_MODE = 'scripted';
    process.env.DATA_SOURCE = 'sqlite';
    process.env.SQLITE_PATH = db;
    const { runChat } = await import('../src/lib/agent/pipeline');
    const { INITIAL_CHAT_STATE, DEFAULT_CRITERIA } = await import('../src/lib/agent/blocks');
    for (const pc of PIPELINE) {
      const messages: { role: 'user' | 'assistant'; text: string }[] = [];
      let state = structuredClone(INITIAL_CHAT_STATE);
      let last: P[] = [];
      for (const turn of pc.turns) {
        messages.push({ role: 'user', text: turn });
        const r = await runChat({ messages, state, criteria: DEFAULT_CRITERIA });
        state = r.state;
        const q = r.blocks.find((b) => b.type === 'question');
        if (q && 'question' in q) messages.push({ role: 'assistant', text: q.question });
        const pb = r.blocks.find((b) => b.type === 'products');
        last = pb && 'products' in pb ? (pb.products as P[]) : [];
      }
      const ok = last.some((p) => hit({ title: [pc.title], cat: pc.cat }, p));
      pipeOk &&= ok;
      console.log(`${ok ? '✓' : '✗'} pipeline: ${pc.turns.join(' → ')}  →  ${last.slice(0, 2).map((p) => p.title.slice(0, 40)).join(' | ') || '(no products)'}`);
    }
  }

  if (!args.has('--no-gate') && (t3 / n < 0.9 || t1 / n < 0.75 || !pipeOk)) {
    console.log('search-eval: BELOW TARGET (top-3 ≥ 90%, top-1 ≥ 75%, pipeline all ✓)');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
