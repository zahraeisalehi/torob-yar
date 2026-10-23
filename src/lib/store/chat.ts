'use client';
import { create } from 'zustand';
import { INITIAL_CHAT_STATE, type ChatState, type UIBlock } from '../agent/blocks';
import type { Product } from '../data/types';
import { api } from '../api';
import { useCriteria, criteriaOf } from './criteria';

export type ChatItem =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; blocks: UIBlock[] };

type S = {
  items: ChatItem[];
  state: ChatState;
  loading: boolean;
  error: string | null;
  lastRequest: { text: string | null; action?: 'refine' | 'enough' } | null;
  products: Record<string, Product>;
  enoughDismissed: boolean;
  scrollTop: number;
  started: () => boolean;
  send: (text: string, action?: 'refine' | 'enough') => Promise<void>;
  retry: () => void;
  dismissEnough: () => void;
  remember: (p: Product) => void;
  reset: () => void;
  setScrollTop: (n: number) => void;
};

let seq = 0;
const nid = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

function textOf(it: ChatItem): string {
  if (it.role === 'user') return it.text;
  return it.blocks
    .map((b) => (b.type === 'text' ? b.text : b.type === 'question' ? b.question : b.type === 'products' ? b.products.map((p) => p.title).join('، ') : ''))
    .filter(Boolean)
    .join('\n');
}

export const useChat = create<S>((set, get) => ({
  items: [],
  state: INITIAL_CHAT_STATE,
  loading: false,
  error: null,
  lastRequest: null,
  products: {},
  enoughDismissed: false,
  scrollTop: 0,
  started: () => get().items.length > 0,
  async send(text, action) {
    if (get().loading) return;
    const trimmed = text.trim();
    if (!trimmed && !action) return;
    const userText = trimmed || (action === 'refine' ? 'دقیق‌ترش کن' : 'همینا خوبن');
    const items = [...get().items, { id: nid(), role: 'user' as const, text: userText }];
    set({ items, loading: true, error: null, lastRequest: { text: userText, action } });
    await runRequest(set, get, items, action);
  },
  retry() {
    const lr = get().lastRequest;
    if (!lr || get().loading) return;
    set({ loading: true, error: null });
    void runRequest(set, get, get().items, lr.action);
  },
  dismissEnough: () => set({ enoughDismissed: true }),
  remember: (p) => set((s) => ({ products: { ...s.products, [p.id]: p } })),
  reset: () => set({ items: [], state: INITIAL_CHAT_STATE, loading: false, error: null, lastRequest: null, enoughDismissed: false, scrollTop: 0 }),
  setScrollTop: (n) => set({ scrollTop: n }),
}));

async function runRequest(
  set: (p: Partial<S> | ((s: S) => Partial<S>)) => void,
  get: () => S,
  items: ChatItem[],
  action?: 'refine' | 'enough',
) {
  try {
    const res = await api.chat({
      messages: items.map((it) => ({ role: it.role, text: textOf(it).slice(0, 1900) })).filter((m) => m.text).slice(-30),
      action,
      state: get().state,
      criteria: criteriaOf(useCriteria.getState()),
    });
    const products = { ...get().products };
    for (const b of res.blocks) if (b.type === 'products') for (const p of b.products) products[p.id] = p;
    const patch = res.blocks.find((b) => b.type === 'criteriaPatch');
    if (patch && patch.type === 'criteriaPatch') {
      const cur = useCriteria.getState();
      useCriteria.getState().set({
        ...patch.patch,
        ...(patch.patch.budget ? { budget: { min: patch.patch.budget.min ?? cur.budget.min, max: patch.patch.budget.max ?? cur.budget.max } } : {}),
      });
    }
    const visible = res.blocks.filter((b) => b.type !== 'criteriaPatch');
    set({
      items: [...items, { id: nid(), role: 'assistant', blocks: visible }],
      state: res.state,
      loading: false,
      products,
      enoughDismissed: action === 'enough' ? true : get().enoughDismissed,
    });
  } catch (e) {
    set({ loading: false, error: e instanceof Error ? e.message : 'خطا' });
  }
}
