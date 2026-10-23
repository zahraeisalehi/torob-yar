import 'server-only';
import { getSource } from '../data/source';
import type { Product } from '../data/types';
import { env } from '../env';
import { normalizeFa } from '../domain/normalize';
import { formatToman } from '../domain/format';
import { contentTokens, modelTokens, parseBudget, wantsInstallment } from '../domain/query';
import {
  InterpretSchema,
  PickSchema,
  type ChatRequest,
  type ChatResponse,
  type ChatState,
  type Criteria,
  type Interpret,
  type SearchFilters,
  type UIBlock,
} from './blocks';
import { applyFilters, buildSpecDiff, defaultPick, freshLabel, templateWhy } from './build';
import { llmJson } from './llm';
import { INTERPRET_SYSTEM, PICK_SYSTEM } from './prompts';
import { detectScenario, isSpecific, matchReply, scripted, type ScriptedQuestion } from './scripted';

type Pending = NonNullable<ChatState['pending']>;

const median = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y);
  return a.length ? a[Math.floor(a.length / 2)] : 0;
};

function toPending(q: ScriptedQuestion): Pending {
  return { question: q.question, replies: q.replies.map((r) => ({ label: r.label, need: r.need, filters: r.filters })) };
}

/** Generic questions when no scripted scenario matches (scripted mode or LLM failure). */
function genericQuestion(n: number, candidates: Product[]): Pending {
  if (n === 0 && candidates.length >= 3) {
    const prices = candidates.map((p) => p.minPrice).sort((a, b) => a - b);
    const lo = prices[Math.floor(prices.length / 3)];
    const hi = prices[Math.floor((prices.length * 2) / 3)];
    const round = (x: number) => {
      const mag = 10 ** Math.max(0, Math.floor(Math.log10(x)) - 1);
      return Math.ceil(x / mag) * mag;
    };
    const a = round(lo);
    const b = round(Math.max(hi, a * 1.5));
    return {
      question: 'تا چه قیمتی راحتی؟',
      replies: [
        { label: `زیر ${formatToman(a)}`, need: `بودجه زیر ${formatToman(a)}`, filters: { maxPrice: a } },
        { label: `${formatToman(a, { unit: false })} تا ${formatToman(b)}`, need: 'بودجه متوسط', filters: { minPrice: a, maxPrice: b } },
        { label: `بالای ${formatToman(b)}`, need: 'کیفیت بالاتر', filters: { minPrice: b } },
        { label: 'مهم نیست', need: '', filters: {} },
      ],
    };
  }
  const brands = [...new Set(candidates.map((p) => p.brand).filter(Boolean) as string[])].slice(0, 3);
  if (brands.length >= 2)
    return {
      question: 'برند خاصی مدنظرته؟',
      replies: [
        ...brands.map((b) => ({ label: b, need: `برند ${b}`, filters: { brand: b } })),
        { label: 'فرقی نمی‌کنه', need: '', filters: {} },
      ],
    };
  return {
    question: 'چه چیزی برات مهم‌تره؟',
    replies: [
      { label: 'ارزون‌تر باشه', need: 'قیمت مناسب', filters: {} },
      { label: 'جاهای بیشتری داشته باشه', need: 'در دسترس بودن', filters: {} },
      { label: 'فرقی نمی‌کنه', need: '', filters: {} },
    ],
  };
}

/** Keep the dominant category of the most relevant hits so popular accessories don't crowd out the real thing. */
function focusCategory(list: Product[]): Product[] {
  if (list.length < 3) return list;
  const counts = new Map<string, number>();
  for (const p of list.slice(0, 5)) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  const [top, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (n < 2 && list[0].category !== top) return list;
  const lead = n >= 2 ? top : list[0].category;
  const focused = list.filter((p) => p.category === lead);
  return focused.length >= 2 ? focused : list;
}

function merge(a: SearchFilters, b: SearchFilters): SearchFilters {
  const out: SearchFilters = { ...a };
  for (const [k, v] of Object.entries(b)) if (v !== undefined && v !== null) (out as Record<string, unknown>)[k] = v;
  return out;
}

function cleanInterpFilters(i: Interpret | null): SearchFilters {
  if (!i) return {};
  const f: SearchFilters = {};
  if (i.filters.minPrice && i.filters.minPrice > 0) f.minPrice = i.filters.minPrice;
  if (i.filters.maxPrice && i.filters.maxPrice > 0) f.maxPrice = i.filters.maxPrice;
  if (i.filters.brand) f.brand = i.filters.brand;
  if (i.filters.category) f.category = i.filters.category;
  return f;
}

function convo(req: ChatRequest): string {
  return req.messages
    .slice(-10)
    .map((m) => `${m.role === 'user' ? 'کاربر' : 'ترب‌یار'}: ${m.text}`)
    .join('\n');
}

export async function runChat(req: ChatRequest): Promise<ChatResponse> {
  const src = getSource();
  const state: ChatState = { ...req.state, needs: [...(req.state.needs ?? [])], filters: { ...req.state.filters } };
  const userTexts = req.messages.filter((m) => m.role === 'user').map((m) => m.text);
  const last = userTexts.at(-1) ?? '';
  const blocks: UIBlock[] = [];
  let usedLive = false;

  if (req.action === 'enough') {
    state.enoughShown = true;
    return {
      blocks: [{ type: 'text', text: 'عالیه! روی کارتی که می‌خوای بزن تا نزدیک‌ترین فروشگاه‌ها رو روی نقشه نشونت بدم.' }],
      state,
      mode: env.llmLive ? 'live' : 'scripted',
    };
  }

  // ---- criteria patch from plain language (قسطی، تا ۲۰ میلیون) ----
  const patch: Partial<Criteria> = {};
  if (wantsInstallment(last)) patch.installment = true;
  const budget = parseBudget(last);
  if (budget.maxPrice || budget.minPrice) patch.budget = { min: budget.minPrice ?? null, max: budget.maxPrice ?? null };

  // ---- scenario + answer to the pending question ----
  const scenario = state.scenario ? scripted().scenarios.find((s) => s.id === state.scenario) ?? null : detectScenario(userTexts.join(' '));
  state.scenario = scenario?.id ?? null;
  const isRefine = req.action === 'refine';
  let answeredPending = false;
  if (state.pending && !isRefine) {
    const reply = matchReply({ question: state.pending.question, replies: state.pending.replies }, last);
    if (reply) {
      state.filters = merge(state.filters, reply.filters);
      if (reply.need) state.needs!.push(reply.need);
    } else if (last.length < 60) {
      state.needs!.push(last);
    }
    answeredPending = true;
    state.pending = null;
  }
  if (budget.maxPrice) state.filters.maxPrice = budget.maxPrice;
  if (budget.minPrice) state.filters.minPrice = budget.minPrice;
  if (!state.searchText) state.searchText = last;

  // free-text corrections after results: cheaper / pricier
  if (state.lastProductIds.length && !answeredPending && !isRefine) {
    const shown = await src.getProducts(state.lastProductIds);
    const med = median(shown.map((p) => p.minPrice));
    if (/ارزون|ارزان|اقتصادی|کمتر/.test(last) && med) {
      state.filters.maxPrice = Math.round(med * 0.9);
      delete state.filters.minPrice;
      state.needs!.push('قیمت پایین‌تر');
    } else if (/گرون|گران|بهتر|حرفه|قوی/.test(last) && med) {
      state.filters.minPrice = Math.round(med * 1.1);
      delete state.filters.maxPrice;
      state.needs!.push('کیفیت بالاتر');
    }
  }

  // ---- interpret (LLM call A) ----
  const rulesNote = [
    `questionsAsked=${state.questionsAsked}`,
    isRefine ? 'کاربر گفت «دقیق‌ترش کن»: حتماً action=ask و یک سؤال تازه بپرس که با سؤال قبلی فرق کند.' : '',
    state.lastProductIds.length ? 'قبلاً کارت کالا نشان داده‌ایم؛ پیام کاربر اصلاح یا پاسخ است: action=search.' : '',
    state.questionsAsked >= 1 && !isRefine ? 'دیگر سؤال نپرس: action=search.' : '',
  ]
    .filter(Boolean)
    .join('\n');
  const interp = await llmJson('interpret', InterpretSchema, INTERPRET_SYSTEM, `${convo(req)}\n\n${rulesNote}`);
  if (interp) {
    usedLive = true;
    state.filters = merge(state.filters, cleanInterpFilters(interp));
    if (interp.searchText?.trim()) state.searchText = interp.searchText.trim();
    if (interp.need && !state.needs!.includes(interp.need)) state.needs!.push(interp.need);
    if (interp.criteriaPatch?.installment) patch.installment = true;
    if (interp.criteriaPatch?.budgetMax && !patch.budget) patch.budget = { min: null, max: interp.criteriaPatch.budgetMax };
  }

  // ---- decide: ask or search (server rules override the LLM) ----
  const specificByScenario = scenario ? isSpecific(scenario, userTexts.join(' ')) : false;
  let specificByFts = false;
  const mt = modelTokens(last);
  if (mt.length) {
    const hits = await src.searchProducts({ text: last, limit: 5 });
    specificByFts = hits.some((p) => mt.some((t) => normalizeFa(p.title).includes(t)));
  }
  let ask: boolean;
  if (state.questionsAsked >= 2) ask = false;
  else if (isRefine) ask = true;
  else if (state.lastProductIds.length) ask = false;
  else if (state.questionsAsked >= 1) ask = false;
  else if (specificByScenario || specificByFts) ask = false;
  else if (interp) ask = interp.action === 'ask';
  else ask = true;

  const scriptedSearchText = () => {
    if (!scenario || specificByScenario || specificByFts) return userTexts[0] ?? last;
    return scenario.searchText;
  };
  const searchText = (interp?.searchText?.trim() && state.searchText) || scriptedSearchText();
  state.searchText = searchText;

  const findCandidates = async (f: SearchFilters, text = searchText) => {
    const res = await src.searchProducts({
      text,
      minPrice: f.minPrice,
      maxPrice: f.maxPrice,
      brand: f.brand,
      category: f.category,
      limit: 40,
    });
    return focusCategory(applyFilters(res, { include: f.include, exclude: f.exclude }));
  };

  // A request for something we don't carry (e.g. shoes): say so instead of asking questions.
  if (!state.lastProductIds.length && state.questionsAsked === 0 && !scenario) {
    const head = contentTokens(last)[0];
    const probe = await findCandidates({});
    const headHit = head ? probe.some((p) => normalizeFa(`${p.title} ${p.category}`).includes(head)) : probe.length > 0;
    if (!probe.length || !headHit) {
      blocks.push({
        type: 'text',
        text: `«${last.trim().slice(0, 40)}» رو توی فروشگاه‌های ثبت‌شده پیدا نکردم. کاتالوگ ما بیشتر لوازم الکترونیکی و برقیه؛ مثلاً یکی از این‌ها:`,
      });
      blocks.push({ type: 'suggestions', items: scripted().examples });
      return { blocks, state: { ...state, searchText: undefined }, mode: usedLive ? 'live' : 'scripted' };
    }
  }

  if (ask) {
    let pending: Pending | null = null;
    const liveQ = interp?.action === 'ask' && interp.question && interp.replies && interp.replies.length >= 2 ? interp : null;
    if (liveQ) {
      pending = {
        question: liveQ.question!,
        replies: liveQ.replies!.slice(0, 4).map((r) => ({ label: r, need: r, filters: { ...parseBudget(r) } })),
      };
    } else if (scenario) {
      pending = toPending(state.questionsAsked === 0 ? scenario.q1 : scenario.q2);
    } else {
      pending = genericQuestion(state.questionsAsked, await findCandidates(state.filters));
    }
    // A refine question must be new.
    if (isRefine && req.messages.some((m) => m.role === 'assistant' && m.text === pending!.question)) {
      pending = scenario ? toPending(scenario.q2) : genericQuestion(1, await findCandidates(state.filters));
    }
    state.pending = pending;
    state.questionsAsked = Math.min(2, state.questionsAsked + 1) as 0 | 1 | 2;
    blocks.push({ type: 'question', question: pending.question, replies: pending.replies.map((r) => r.label).slice(0, 4) });
    if (Object.keys(patch).length) blocks.push({ type: 'criteriaPatch', patch });
    return { blocks, state, mode: usedLive ? 'live' : 'scripted' };
  }

  // ---- search with progressive relaxation ----
  let f = { ...state.filters };
  if (!f.maxPrice && req.criteria.budget.max) f.maxPrice = req.criteria.budget.max;
  let candidates = await findCandidates(f);
  const relaxed: string[] = [];
  if (!candidates.length && (f.include || f.exclude || f.brand)) {
    f = { ...f, include: undefined, exclude: undefined, brand: undefined };
    candidates = await findCandidates(f);
    relaxed.push('برند و ویژگی‌ها');
  }
  if (!candidates.length && (f.maxPrice || f.minPrice)) {
    f = { ...f, maxPrice: f.maxPrice ? f.maxPrice * 1.5 : undefined, minPrice: f.minPrice ? f.minPrice / 1.5 : undefined };
    candidates = await findCandidates(f);
    relaxed.push('بودجه');
  }
  if (!candidates.length && f.category) {
    f = { ...f, category: undefined };
    candidates = await findCandidates(f);
    relaxed.push('دسته‌بندی');
  }
  if (!candidates.length && (f.maxPrice || f.minPrice)) {
    f = { ...f, maxPrice: undefined, minPrice: undefined };
    candidates = await findCandidates(f);
  }
  if (!candidates.length && searchText !== last) candidates = await findCandidates({}, last);
  if (!candidates.length) {
    blocks.push({
      type: 'text',
      text: 'متأسفم، با این مشخصات چیزی توی فروشگاه‌های تهران پیدا نکردم. کاتالوگ ما بیشتر لوازم الکترونیکی و برقیه؛ یکی از این‌ها رو امتحان کن:',
    });
    blocks.push({ type: 'suggestions', items: scripted().examples });
    return { blocks, state, mode: usedLive ? 'live' : 'scripted' };
  }
  if (relaxed.length) {
    blocks.push({ type: 'text', tone: 'relaxed', text: `با این شرایط دقیق چیزی پیدا نشد؛ ${relaxed.join(' و ')} رو کمی بازتر گرفتم.` });
  }

  // ---- pick (LLM call B) ----
  const top = candidates.slice(0, 12);
  let picks: Product[] = [];
  let why: Record<string, string> = {};
  let intro = '';
  let diffKeys: string[] = [];
  const pick = await llmJson(
    'pick',
    PickSchema,
    PICK_SYSTEM,
    `گفت‌وگو:\n${convo(req)}\n\nنیازهای کاربر: ${(state.needs ?? []).join('، ') || 'نامشخص'}\n\nنامزدها:\n${JSON.stringify(
      top.map((p) => ({
        id: p.id,
        title: p.title,
        brand: p.brand,
        price: `${p.minPrice}-${p.maxPrice}`,
        shops: p.shopCount,
        fresh: p.freshShare,
        specs: p.keySpecs.slice(0, 8),
      })),
    )}`,
  );
  if (pick) {
    const ids = [...new Set(pick.pickIds)].filter((id) => top.some((p) => p.id === id));
    if (ids.length >= Math.min(2, top.length)) {
      usedLive = true;
      picks = ids.slice(0, 4).map((id) => top.find((p) => p.id === id)!);
      why = Object.fromEntries(picks.map((p) => [p.id, pick.why[p.id] ?? templateWhy(p, state.needs ?? [], picks)]));
      intro = pick.intro;
      diffKeys = pick.diffKeys;
    }
  }
  if (!picks.length) {
    const tokens = modelTokens(userTexts.join(' '));
    const exact = tokens.length ? top.filter((p) => tokens.every((t) => normalizeFa(p.title).includes(t))) : [];
    picks = exact.length ? [...defaultPick(exact, 1), ...defaultPick(top.filter((p) => !exact.includes(p)), 2)] : defaultPick(top, 3);
    picks = picks.slice(0, 4);
    why = Object.fromEntries(picks.map((p) => [p.id, templateWhy(p, state.needs ?? [], picks)]));
    const needs = (state.needs ?? []).filter(Boolean);
    intro = exact.length
      ? 'اینم همونی که گفتی، با دو گزینه‌ی نزدیک برای مقایسه:'
      : needs.length
        ? `برای ${needs.slice(-2).join(' و ')} این‌ها رو پیشنهاد می‌کنم:`
        : 'این‌ها بهترین گزینه‌هایی هستن که پیدا کردم:';
  }

  state.lastProductIds = picks.map((p) => p.id);
  state.filters = { ...state.filters };
  blocks.push({ type: 'text', text: intro });
  blocks.push({ type: 'products', products: picks, why, freshLabel: Object.fromEntries(picks.map((p) => [p.id, freshLabel(p)])) });
  if (picks.length >= 2) {
    const rows = buildSpecDiff(picks, diffKeys);
    if (rows.length >= 2) blocks.push({ type: 'specDiff', productIds: picks.map((p) => p.id), rows });
  }
  if (!state.enoughShown && state.questionsAsked < 2) {
    blocks.push({ type: 'enough' });
    state.enoughShown = true;
  }
  if (Object.keys(patch).length) blocks.push({ type: 'criteriaPatch', patch });
  return { blocks, state, mode: usedLive ? 'live' : 'scripted' };
}
