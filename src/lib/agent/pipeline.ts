import 'server-only';
import { getSource } from '../data/source';
import type { Product } from '../data/types';
import { env } from '../env';
import { normalizeFa } from '../domain/normalize';
import { formatToman } from '../domain/format';
import { contentTokens, parseBudget, typeTokens, wantsInstallment } from '../domain/query';
import { analyzeQuery, modelHit, typeMatches } from '../domain/search';
import {
  PickSchema,
  TurnSchema,
  type Turn,
  type ChatRequest,
  type ChatResponse,
  type ChatState,
  type Criteria,
  type SearchFilters,
  type UIBlock,
} from './blocks';
import { applyFilters, buildSpecDiff, defaultPick, freshLabel, templateWhy } from './build';
import { llmJson } from './llm';
import { PICK_SYSTEM, TURN_SYSTEM } from './prompts';
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
    // friendly anchors: 1, 1.5, 2, 3, 4, 5, 7 × 10^k («زیر ۵ میلیون», not «زیر ۴٫۷ میلیون»)
    const round = (x: number) => {
      const mag = 10 ** Math.floor(Math.log10(Math.max(1, x)));
      return ([1, 1.5, 2, 3, 4, 5, 7, 10].find((n) => n * mag >= x) ?? 10) * mag;
    };
    const a = round(lo);
    const b = round(Math.max(hi, a * 1.5));
    return {
      question: 'تا چه قیمتی راحتی؟',
      replies: [
        { label: `زیر ${formatToman(a)}`, need: `بودجه زیر ${formatToman(a)}`, filters: { maxPrice: a } },
        // «تا چه قیمتی؟» is answered with ceilings, so cheaper good options stay in the middle tier
        { label: `زیر ${formatToman(b)}`, need: `بودجه زیر ${formatToman(b)}`, filters: { maxPrice: b } },
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

/** Drop candidates that aren't the requested kind of product (a battery for an earbuds query), unless nothing is left. */
function keepType(list: Product[], text: string): Product[] {
  const a = analyzeQuery(text);
  const kept = list.filter((p) => typeMatches(a, p));
  return kept.length ? kept : list;
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

  // ---- a new product mid-conversation («redmi buds 8 active» after a phone search) starts a fresh search ----
  const isRefine = req.action === 'refine';
  const lastA = analyzeQuery(last);
  const lastHits = await src.searchProducts({ text: last, limit: 5 });
  // the user named a concrete model: every model token (Latin word, number, series word) is in a top hit's title
  const namesModel = lastHits.slice(0, 3).some((p) => modelHit(lastA, p));
  const prevTypes = state.searchText ? analyzeQuery(state.searchText).types : [];
  const newType = lastA.types.length > 0 && !lastA.types.some((t) => prevTypes.includes(t));
  const answersPending = !!state.pending && !!matchReply({ question: state.pending.question, replies: state.pending.replies }, last);
  const hadSearch = !!state.searchText && (state.lastProductIds.length > 0 || state.questionsAsked > 0);
  const freshSearch = hadSearch && !isRefine && !answersPending && (namesModel || newType);
  // texts of the current search session (scenario detection must not see the previous product)
  const sessionTexts = freshSearch ? [last] : userTexts;
  if (freshSearch) {
    Object.assign(state, { questionsAsked: 0, enoughShown: false, lastProductIds: [], filters: {}, scenario: null, pending: null, needs: [], searchText: undefined });
  }

  // ---- scenario + answer to the pending question ----
  const scenario = state.scenario ? scripted().scenarios.find((s) => s.id === state.scenario) ?? null : detectScenario(sessionTexts.join(' '));
  state.scenario = scenario?.id ?? null;
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

  // ---- server rules decide whether a question is allowed (the LLM never overrides these) ----
  const specificByScenario = scenario ? isSpecific(scenario, sessionTexts.join(' ')) : false;
  const specific = specificByScenario || namesModel;
  type Rule = 'must_ask' | 'must_show' | 'free';
  const rule: Rule =
    state.questionsAsked >= 2
      ? 'must_show'
      : isRefine
        ? 'must_ask'
        : state.lastProductIds.length || state.questionsAsked >= 1 || specific
          ? 'must_show'
          : // a bare product type ("هندزفری میخوام") always gets one question first (UI_SPEC §2.3 example)
            typeTokens(last).length <= 2 && !budget.maxPrice && !budget.minPrice
            ? 'must_ask'
            : 'free';

  const scriptedSearchText = () => {
    if (!scenario || specific) return state.searchText ?? last;
    return scenario.searchText;
  };
  let searchText = state.searchText && state.searchText !== last ? state.searchText : scriptedSearchText();
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
    return focusCategory(keepType(applyFilters(res, { include: f.include, exclude: f.exclude }), text));
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
      return { blocks, state: { ...state, searchText: undefined }, mode: 'scripted' };
    }
  }

  // ---- candidates with progressive relaxation ----
  const relaxed: string[] = [];
  const gather = async () => {
    let f = { ...state.filters };
    if (!f.maxPrice && req.criteria.budget.max) f.maxPrice = req.criteria.budget.max;
    let c = await findCandidates(f);
    if (!c.length && (f.include || f.exclude || f.brand)) {
      f = { ...f, include: undefined, exclude: undefined, brand: undefined };
      c = await findCandidates(f);
      relaxed.push('برند و ویژگی‌ها');
    }
    if (!c.length && (f.maxPrice || f.minPrice)) {
      f = { ...f, maxPrice: f.maxPrice ? f.maxPrice * 1.5 : undefined, minPrice: f.minPrice ? f.minPrice / 1.5 : undefined };
      c = await findCandidates(f);
      relaxed.push('بودجه');
    }
    if (!c.length && f.category) {
      f = { ...f, category: undefined };
      c = await findCandidates(f);
      relaxed.push('دسته‌بندی');
    }
    if (!c.length && (f.maxPrice || f.minPrice)) c = await findCandidates({ ...f, maxPrice: undefined, minPrice: undefined });
    if (!c.length && searchText !== last) c = await findCandidates({}, last);
    return c;
  };
  let candidates = await gather();

  // «دقیق‌ترش کن» with no budget yet → the budget question (server rule; budget is the most useful refinement)
  const budgetKnown = !!(state.filters.maxPrice || state.filters.minPrice || req.criteria.budget.max || req.criteria.budget.min);
  const refineToBudget = isRefine && !budgetKnown && candidates.length >= 3;

  // ---- one combined LLM call: ask one question, or pick + explain (live mode) ----
  let turn: Turn | null = null;
  if (env.llmLive && !refineToBudget) {
    const rulesNote = `قاعده‌ی سرور: ${rule}${isRefine ? ' (کاربر گفت «دقیق‌ترش کن»؛ سؤالی تازه بپرس که با قبلی فرق کند)' : ''}`;
    turn = await llmJson(
      'turn',
      TurnSchema,
      TURN_SYSTEM,
      `گفت‌وگو:\n${convo(req)}\n\n${rulesNote}\nنیازهای گفته‌شده: ${(state.needs ?? []).join('، ') || 'هنوز نامشخص'}\nجست‌وجو برای: «${searchText}»\n\nنامزدها:\n${candidateJson(candidates)}`,
    );
    if (turn) {
      usedLive = true;
      if (turn.need && !state.needs!.includes(turn.need)) state.needs!.push(turn.need);
      const lf: SearchFilters = {};
      if (turn.filters?.maxPrice && turn.filters.maxPrice > 0) lf.maxPrice = turn.filters.maxPrice;
      if (turn.filters?.minPrice && turn.filters.minPrice > 0) lf.minPrice = turn.filters.minPrice;
      if (turn.filters?.brand) lf.brand = turn.filters.brand;
      if (turn.criteriaPatch?.installment) patch.installment = true;
      if (turn.criteriaPatch?.budgetMax && !patch.budget) patch.budget = { min: null, max: turn.criteriaPatch.budgetMax };
      const filtersChanged = Object.entries(lf).some(([k, v]) => (state.filters as Record<string, unknown>)[k] !== v);
      state.filters = merge(state.filters, lf);
      if (turn.action === 'research' && turn.searchText?.trim()) {
        const raw = candidates;
        searchText = turn.searchText.trim();
        state.searchText = searchText;
        candidates = await gather();
        // the user named the model: the raw-text hits stay first, the LLM's re-search only adds
        if (specific) candidates = [...raw, ...candidates.filter((p) => !raw.some((r) => r.id === p.id))];
      } else if (filtersChanged && rule !== 'must_ask') {
        candidates = await gather();
      }
    }
  }

  const ask = rule === 'must_ask' || (rule === 'free' && (turn ? turn.action === 'ask' : true));
  if (ask) {
    let pending: Pending;
    const q = turn?.action === 'ask' && turn.question && (turn.replies?.length ?? 0) >= 2 ? turn : null;
    if (refineToBudget) {
      // anchors from the cards on screen (what «دقیق‌ترش کن» refines), not the whole candidate pool
      const shown = state.lastProductIds.length ? await src.getProducts(state.lastProductIds) : [];
      pending = genericQuestion(0, shown.length >= 3 ? shown : candidates);
    } else if (q && !req.messages.some((m) => m.role === 'assistant' && m.text.includes(q.question!))) {
      pending = { question: q.question!, replies: q.replies!.slice(0, 4).map((r) => ({ label: r, need: r, filters: { ...parseBudget(r) } })) };
    } else if (scenario) {
      pending = toPending(state.questionsAsked === 0 && !isRefine ? scenario.q1 : scenario.q2);
    } else {
      pending = genericQuestion(state.questionsAsked, candidates);
    }
    // A refine question must be new.
    if (isRefine && req.messages.some((m) => m.role === 'assistant' && m.text.includes(pending.question))) {
      pending = scenario ? toPending(scenario.q2) : genericQuestion(1, candidates);
    }
    state.pending = pending;
    state.questionsAsked = Math.min(2, state.questionsAsked + 1) as 0 | 1 | 2;
    blocks.push({ type: 'question', question: pending.question, replies: pending.replies.map((r) => r.label).slice(0, 4) });
    if (Object.keys(patch).length) blocks.push({ type: 'criteriaPatch', patch });
    return { blocks, state, mode: usedLive ? 'live' : 'scripted' };
  }

  if (!candidates.length) {
    blocks.push({
      type: 'text',
      text: 'متأسفم، با این مشخصات چیزی توی فروشگاه‌های تهران پیدا نکردم. کاتالوگ ما بیشتر لوازم الکترونیکی و برقیه؛ یکی از این‌ها رو امتحان کن:',
    });
    blocks.push({ type: 'suggestions', items: scripted().examples });
    return { blocks, state, mode: usedLive ? 'live' : 'scripted' };
  }
  if (relaxed.length) {
    blocks.push({ type: 'text', tone: 'relaxed', text: `با این شرایط دقیق چیزی پیدا نشد؛ ${[...new Set(relaxed)].join(' و ')} رو کمی بازتر گرفتم.` });
  }

  // ---- picks: validated LLM picks (⊆ candidates), else deterministic ----
  const top = candidates.slice(0, 12);
  let picks: Product[] = [];
  let why: Record<string, string> = {};
  let intro = '';
  let diffKeys: string[] = [];
  if (turn?.pickIds?.length && turn.action !== 'research') {
    const ids = [...new Set(turn.pickIds)].filter((id) => top.some((p) => p.id === id));
    if (ids.length >= Math.min(2, top.length)) {
      picks = ids.slice(0, 4).map((id) => top.find((p) => p.id === id)!);
      why = Object.fromEntries(picks.map((p) => [p.id, turn!.why?.[p.id] ?? templateWhy(p, state.needs ?? [], picks)]));
      intro = turn.intro ?? '';
      diffKeys = turn.diffKeys ?? [];
    }
  }
  if (!picks.length && turn && env.llmLive) {
    // the combined call asked or re-searched where it shouldn't have: one focused pick call
    const pick = await llmJson(
      'pick',
      PickSchema,
      PICK_SYSTEM,
      `گفت‌وگو:\n${convo(req)}\n\nنیازهای کاربر: ${(state.needs ?? []).join('، ') || 'نامشخص'}\n\nنامزدها:\n${candidateJson(top)}`,
    );
    const ids = pick ? [...new Set(pick.pickIds)].filter((id) => top.some((p) => p.id === id)) : [];
    if (pick && ids.length >= Math.min(2, top.length)) {
      picks = ids.slice(0, 4).map((id) => top.find((p) => p.id === id)!);
      why = Object.fromEntries(picks.map((p) => [p.id, pick.why[p.id] ?? templateWhy(p, state.needs ?? [], picks)]));
      intro = pick.intro;
      diffKeys = pick.diffKeys;
    }
  }
  if (!picks.length) {
    const exact = namesModel ? top.filter((p) => modelHit(lastA, p)) : [];
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
  if (!intro) intro = 'این‌ها رو برات پیدا کردم:';

  state.lastProductIds = picks.map((p) => p.id);
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

function candidateJson(list: Product[]): string {
  if (!list.length) return '[] (هیچ نامزدی پیدا نشد)';
  return JSON.stringify(
    list.slice(0, 12).map((p) => ({
      id: p.id,
      title: p.title,
      brand: p.brand,
      price: `${p.minPrice}-${p.maxPrice}`,
      shops: p.shopCount,
      specs: p.keySpecs.slice(0, 6).map((s) => `${s.key}: ${s.value.slice(0, 40)}`),
    })),
  );
}
