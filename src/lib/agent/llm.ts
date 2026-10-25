import 'server-only';
import { generateText } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { z } from 'zod';
import { env } from '../env';
import { trace } from '../trace';

const provider = () =>
  createOpenAICompatible({ name: 'boxapi', baseURL: env.BOXAPI_BASE_URL, apiKey: env.BOXAPI_API_KEY });

function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('no JSON object in response');
  return JSON.parse(t.slice(start, end + 1));
}

async function callOnce(model: string, system: string, prompt: string, timeoutMs: number): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await generateText({
      model: provider()(model),
      system,
      prompt,
      maxRetries: 0,
      abortSignal: ctrl.signal,
      // gpt-5.x on BoxAPI: 'none' cuts ~2 s per call versus the default reasoning effort
      ...(env.LLM_REASONING_EFFORT ? { providerOptions: { boxapi: { reasoningEffort: env.LLM_REASONING_EFFORT } } } : {}),
    });
    return res.text;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * JSON-only call validated by zod: one retry with the validation error appended,
 * then LLM_FALLBACK_MODEL once, then null (the caller falls back to the scripted path).
 */
export async function llmJson<T>(
  name: string,
  schema: z.ZodType<T>,
  system: string,
  prompt: string,
  timeoutMs = 20_000,
): Promise<T | null> {
  if (!env.llmLive || !env.BOXAPI_API_KEY) {
    trace('llm', { call: name, path: 'scripted', why: env.LLM_MODE === 'scripted' ? 'LLM_MODE=scripted' : 'no BOXAPI_API_KEY' });
    return null;
  }
  const models = [env.LLM_MODEL, env.LLM_FALLBACK_MODEL].filter(Boolean);
  for (const [mi, model] of models.entries()) {
    let p = prompt;
    for (let attempt = 0; attempt < 2; attempt++) {
      const t0 = Date.now();
      try {
        const text = await callOnce(model, system, p, timeoutMs);
        const parsed = schema.safeParse(extractJson(text));
        log({ call: name, model, ms: Date.now() - t0, ok: parsed.success, attempt, fallback: mi > 0 });
        trace('llm', {
          call: name,
          path: mi > 0 ? 'fallback model' : 'live',
          model,
          attempt,
          ms: Date.now() - t0,
          ok: parsed.success,
          raw: parsed.success ? parsed.data : text.slice(0, 600),
          ...(parsed.success ? {} : { why: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }),
        });
        if (parsed.success) return parsed.data;
        p = `${prompt}\n\nYour previous answer was invalid: ${parsed.error.issues
          .slice(0, 4)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}. Reply again with ONLY the corrected JSON object.`;
      } catch (e) {
        log({ call: name, model, ms: Date.now() - t0, ok: false, attempt, fallback: mi > 0, error: String(e).slice(0, 160) });
        trace('llm', { call: name, path: mi > 0 ? 'fallback model' : 'live', model, attempt, ms: Date.now() - t0, ok: false, why: String(e).slice(0, 200) });
        break; // network/timeout: go to the fallback model
      }
    }
  }
  // visible in `liara logs`: the caller now answers from the scripted path
  console.log(JSON.stringify({ t: new Date().toISOString(), kind: 'scripted_fallback', call: name, why: 'all LLM attempts failed' }));
  trace('llm', { call: name, path: 'scripted', why: 'all LLM attempts failed (see entries above)' });
  return null;
}

function log(o: Record<string, unknown>) {
  console.log(JSON.stringify({ t: new Date().toISOString(), kind: 'llm', ...o }));
}

/** Free-text answer (find-help). */
export async function llmText(name: string, system: string, prompt: string, timeoutMs = 20_000): Promise<string | null> {
  if (!env.llmLive || !env.BOXAPI_API_KEY) return null;
  for (const [mi, model] of [env.LLM_MODEL, env.LLM_FALLBACK_MODEL].filter(Boolean).entries()) {
    const t0 = Date.now();
    try {
      const text = await callOnce(model, system, prompt, timeoutMs);
      log({ call: name, model, ms: Date.now() - t0, ok: true, fallback: mi > 0 });
      if (text.trim()) return text.trim();
    } catch (e) {
      log({ call: name, model, ms: Date.now() - t0, ok: false, fallback: mi > 0, error: String(e).slice(0, 160) });
    }
  }
  return null;
}
