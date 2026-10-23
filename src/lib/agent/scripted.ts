import fs from 'node:fs';
import path from 'node:path';
import { fixturesDir } from '../data/fixtures';
import type { SearchFilters } from './blocks';
import { normalizeFa } from '../domain/normalize';

export type ScriptedReply = { label: string; need: string; filters: SearchFilters };
export type ScriptedQuestion = { question: string; replies: ScriptedReply[] };
export type Scenario = {
  id: string;
  keywords: string[];
  specific: string;
  searchText: string;
  q1: ScriptedQuestion;
  q2: ScriptedQuestion;
};
export type ScriptedFile = { examples: string[]; scenarios: Scenario[] };

let cache: ScriptedFile | null = null;
export function scripted(): ScriptedFile {
  cache ??= JSON.parse(fs.readFileSync(path.join(fixturesDir(), 'scripted.json'), 'utf8')) as ScriptedFile;
  return cache;
}

export function detectScenario(text: string): Scenario | null {
  const t = ' ' + normalizeFa(text) + ' ';
  let best: { s: Scenario; n: number } | null = null;
  for (const s of scripted().scenarios) {
    const n = s.keywords.filter((k) => t.includes(normalizeFa(k))).length;
    if (n && (!best || n > best.n)) best = { s, n };
  }
  return best?.s ?? null;
}

export function isSpecific(s: Scenario, text: string): boolean {
  return new RegExp(s.specific, 'i').test(normalizeFa(text));
}

/** Match a free-form answer to one of the quick replies (exact chip text or loose overlap). */
export function matchReply(q: ScriptedQuestion, text: string): ScriptedReply | null {
  const t = normalizeFa(text);
  const exact = q.replies.find((r) => normalizeFa(r.label) === t);
  if (exact) return exact;
  let best: { r: ScriptedReply; n: number } | null = null;
  for (const r of q.replies) {
    const words = normalizeFa(r.label).split(' ').filter((w) => w.length > 2);
    const n = words.filter((w) => t.includes(w)).length;
    if (n && (!best || n > best.n)) best = { r, n };
  }
  return best?.r ?? null;
}
