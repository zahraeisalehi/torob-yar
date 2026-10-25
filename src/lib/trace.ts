// Per-request debug trace (x-debug-trace header on /api/chat, or `npm run trace`).
// Any layer can call trace(stage, data); nothing is recorded (or computed) unless a trace is active.
import { AsyncLocalStorage } from 'node:async_hooks';

export type TraceEvent = { stage: string; ms: number; data: unknown };
type Store = { t0: number; events: TraceEvent[] };

const als = new AsyncLocalStorage<Store>();

export async function withTrace<T>(fn: () => Promise<T>): Promise<{ result: T; trace: TraceEvent[] }> {
  const store: Store = { t0: Date.now(), events: [] };
  const result = await als.run(store, fn);
  return { result, trace: store.events };
}

export const tracing = () => !!als.getStore();

/** `data` may be a function so expensive breakdowns are only computed while tracing. */
export function trace(stage: string, data: unknown | (() => unknown)): void {
  const s = als.getStore();
  if (!s) return;
  s.events.push({ stage, ms: Date.now() - s.t0, data: typeof data === 'function' ? (data as () => unknown)() : data });
}
