import 'server-only';
import { env } from '../env';

const g = globalThis as unknown as { __sttOk?: boolean | null };

export function sttStatus(): boolean {
  if (!env.BOXAPI_API_KEY || !env.STT_MODEL || env.LLM_MODE === 'scripted') return false;
  return g.__sttOk ?? true;
}

const EXT: Record<string, string> = { webm: 'webm', ogg: 'ogg', mp4: 'mp4', 'x-m4a': 'm4a', m4a: 'm4a', mpeg: 'mp3', wav: 'wav', aac: 'm4a' };

export function extFor(mime: string): string {
  const sub = mime.split(';')[0].split('/')[1] ?? 'webm';
  return EXT[sub] ?? 'webm';
}

export async function transcribe(blob: Blob, mime: string): Promise<string> {
  const form = new FormData();
  form.append('model', env.STT_MODEL);
  form.append('file', new File([blob], `audio.${extFor(mime)}`, { type: mime.split(';')[0] }));
  form.append('language', 'fa');
  form.append('response_format', 'json');
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(`${env.BOXAPI_BASE_URL}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.BOXAPI_API_KEY}` },
      body: form,
      signal: ctrl.signal,
    });
    const body = await res.text();
    console.log(JSON.stringify({ kind: 'stt', model: env.STT_MODEL, ms: Date.now() - t0, status: res.status, mime }));
    if (!res.ok) throw new Error(`stt ${res.status}: ${body.slice(0, 200)}`);
    let text = body;
    try {
      text = (JSON.parse(body) as { text?: string }).text ?? '';
    } catch {
      /* plain text response */
    }
    g.__sttOk = true;
    return text.trim();
  } catch (e) {
    g.__sttOk = false;
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
