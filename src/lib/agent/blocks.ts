import { z } from 'zod';
import type { Product } from '../data/types';

export type Criteria = {
  budget: { min: number | null; max: number | null };
  distanceKm: number | null; // null = همه
  installment: boolean;
  openNow: boolean;
};

export const DEFAULT_CRITERIA: Criteria = { budget: { min: null, max: null }, distanceKm: null, installment: false, openNow: false };

export const SearchFiltersSchema = z.object({
  minPrice: z.number().positive().optional(),
  maxPrice: z.number().positive().optional(),
  brand: z.string().optional(),
  category: z.string().optional(),
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
});
export type SearchFilters = z.infer<typeof SearchFiltersSchema>;

export const ChatStateSchema = z.object({
  questionsAsked: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  enoughShown: z.boolean(),
  lastProductIds: z.array(z.string()),
  filters: SearchFiltersSchema,
  scenario: z.string().nullable().optional(),
  /** the question we just asked, with how each quick reply maps to filters */
  pending: z
    .object({
      question: z.string(),
      replies: z.array(z.object({ label: z.string(), need: z.string(), filters: SearchFiltersSchema })),
    })
    .nullable()
    .optional(),
  needs: z.array(z.string()).optional(),
  searchText: z.string().optional(),
});
export type ChatState = z.infer<typeof ChatStateSchema>;

export const INITIAL_CHAT_STATE: ChatState = {
  questionsAsked: 0,
  enoughShown: false,
  lastProductIds: [],
  filters: {},
  scenario: null,
  pending: null,
  needs: [],
};

export type SpecDiffRow = { key: string; values: (string | null)[]; bestIndex: number | null };

export type UIBlock =
  | { type: 'text'; text: string; tone?: 'info' | 'relaxed' }
  | { type: 'question'; question: string; replies: string[] }
  | { type: 'products'; products: Product[]; why: Record<string, string>; freshLabel: Record<string, string> }
  | { type: 'specDiff'; productIds: string[]; rows: SpecDiffRow[] }
  | { type: 'enough' }
  | { type: 'criteriaPatch'; patch: Partial<Criteria> }
  | { type: 'suggestions'; items: string[] };

export const ChatRequestSchema = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(2000) })).min(1).max(40),
  action: z.enum(['refine', 'enough']).optional(),
  state: ChatStateSchema.default(INITIAL_CHAT_STATE),
  criteria: z
    .object({
      budget: z.object({ min: z.number().nullable(), max: z.number().nullable() }),
      distanceKm: z.number().nullable(),
      installment: z.boolean(),
      openNow: z.boolean(),
    })
    .default(DEFAULT_CRITERIA),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type ChatResponse = { blocks: UIBlock[]; state: ChatState; mode: 'live' | 'scripted' };

/** LLM call A output. */
export const InterpretSchema = z.object({
  action: z.enum(['ask', 'search']),
  question: z.string().optional().nullable(),
  replies: z.array(z.string()).optional().nullable(),
  searchText: z.string().default(''),
  need: z.string().optional().nullable(),
  filters: z
    .object({
      minPrice: z.number().nullable().optional(),
      maxPrice: z.number().nullable().optional(),
      brand: z.string().nullable().optional(),
      category: z.string().nullable().optional(),
    })
    .default({}),
  criteriaPatch: z
    .object({ installment: z.boolean().optional(), budgetMax: z.number().nullable().optional() })
    .nullable()
    .optional(),
});
export type Interpret = z.infer<typeof InterpretSchema>;

/** LLM call B output. */
export const PickSchema = z.object({
  pickIds: z.array(z.string()).min(1).max(4),
  why: z.record(z.string(), z.string()),
  intro: z.string(),
  diffKeys: z.array(z.string()).optional().default([]),
});
export type Pick = z.infer<typeof PickSchema>;

/** Combined per-turn LLM output (TURN_SYSTEM). */
export const TurnSchema = z.object({
  action: z.enum(['ask', 'show', 'research']),
  question: z.string().nullish(),
  replies: z.array(z.string()).nullish(),
  need: z.string().nullish(),
  filters: z
    .object({ minPrice: z.number().nullish(), maxPrice: z.number().nullish(), brand: z.string().nullish() })
    .nullish(),
  criteriaPatch: z.object({ installment: z.boolean().nullish(), budgetMax: z.number().nullish() }).nullish(),
  pickIds: z.array(z.string()).nullish(),
  why: z.record(z.string(), z.string()).nullish(),
  intro: z.string().nullish(),
  diffKeys: z.array(z.string()).nullish(),
  searchText: z.string().nullish(),
});
export type Turn = z.infer<typeof TurnSchema>;
