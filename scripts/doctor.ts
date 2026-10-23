/* npm run doctor — checks env, data, rw dir, BoxAPI capabilities, STT models and map style. Prints a ✓/✗ table. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import Database from 'better-sqlite3';

const ROOT = path.resolve(__dirname, '..');
const ENV_LOCAL = path.join(ROOT, '.env.local');

// load .env.local without printing it (values never logged)
function loadEnv() {
  if (!fs.existsSync(ENV_LOCAL)) return;
  for (const line of fs.readFileSync(ENV_LOCAL, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
loadEnv();

const E = {
  DATA_SOURCE: process.env.DATA_SOURCE ?? 'fixtures',
  SQLITE_PATH: process.env.SQLITE_PATH ?? './data/app.sqlite',
  DATA_RW_DIR: process.env.DATA_RW_DIR ?? './data/rw',
  BASE: process.env.BOXAPI_BASE_URL ?? 'https://ai.boxapi.ir/ai/v1',
  KEY: process.env.BOXAPI_API_KEY ?? '',
  MODEL: process.env.LLM_MODEL ?? 'gpt-5.4-mini',
  FALLBACK: process.env.LLM_FALLBACK_MODEL ?? '',
  STT: process.env.STT_MODEL ?? '',
  MAP: process.env.NEXT_PUBLIC_MAP_STYLE ?? 'https://tiles.openfreemap.org/styles/positron',
};

type Row = { check: string; ok: boolean | null; detail: string };
const rows: Row[] = [];
const add = (check: string, ok: boolean | null, detail = '') => {
  rows.push({ check, ok, detail });
  console.log(`${ok === null ? '·' : ok ? '✓' : '✗'} ${check}${detail ? ' — ' + detail : ''}`);
};

async function chat(body: Record<string, unknown>, timeoutMs = 25_000) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${E.BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${E.KEY}` },
      body: JSON.stringify({ model: E.MODEL, ...body }),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { status: res.status, ms: Date.now() - t0, json: json as Record<string, unknown> | null, text };
  } finally {
    clearTimeout(t);
  }
}

function msgOf(j: Record<string, unknown> | null) {
  const c = (j?.choices as { message?: { content?: string; tool_calls?: unknown[] } }[] | undefined)?.[0]?.message;
  return c ?? {};
}

function makeAudio(dir: string): { file: string; mime: string }[] {
  fs.mkdirSync(dir, { recursive: true });
  const out: { file: string; mime: string }[] = [];
  const wav = path.join(dir, 'fa-sample.wav');
  // Spoken Persian if a TTS is installed, otherwise a 2 s tone that only proves format acceptance.
  let speech = false;
  for (const tts of [['espeak-ng', ['-v', 'fa', '-w', wav, 'سلام، یک گوشی سامسونگ می‌خواهم']], ['espeak', ['-v', 'fa', '-w', wav, 'salam']]] as const) {
    try {
      execFileSync(tts[0], tts[1] as unknown as string[], { stdio: 'ignore' });
      speech = true;
      break;
    } catch {
      /* not installed */
    }
  }
  try {
    if (!speech) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', wav]);
    const webm = path.join(dir, 'fa-sample.webm');
    const mp4 = path.join(dir, 'fa-sample.mp4');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libopus', webm]);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-c:a', 'aac', mp4]);
    out.push({ file: webm, mime: 'audio/webm' }, { file: mp4, mime: 'audio/mp4' });
  } catch {
    if (fs.existsSync(path.join(dir, 'fa-sample.webm'))) out.push({ file: path.join(dir, 'fa-sample.webm'), mime: 'audio/webm' });
  }
  add('sample audio', out.length > 0, speech ? 'spoken Persian (espeak)' : 'tone only (no TTS installed)');
  return out;
}

async function stt(model: string, file: string, mime: string) {
  const fd = new FormData();
  fd.append('model', model);
  fd.append('file', new File([fs.readFileSync(file)], path.basename(file), { type: mime }));
  fd.append('language', 'fa');
  fd.append('response_format', 'json');
  const t0 = Date.now();
  const res = await fetch(`${E.BASE}/audio/transcriptions`, { method: 'POST', headers: { authorization: `Bearer ${E.KEY}` }, body: fd, signal: AbortSignal.timeout(30_000) });
  const body = await res.text();
  return { ok: res.ok, status: res.status, ms: Date.now() - t0, body: body.slice(0, 120) };
}

function writeEnvLocal(key: string, value: string) {
  let s = fs.existsSync(ENV_LOCAL) ? fs.readFileSync(ENV_LOCAL, 'utf8') : '';
  const re = new RegExp(`^${key}=.*$`, 'm');
  s = re.test(s) ? s.replace(re, `${key}=${value}`) : `${s.replace(/\n?$/, '\n')}${key}=${value}\n`;
  fs.writeFileSync(ENV_LOCAL, s);
}

async function main() {
  console.log('Torob-yar doctor\n');
  add('DATA_SOURCE', true, E.DATA_SOURCE);
  // fixtures
  const fx = path.join(ROOT, 'data/fixtures');
  const fxFiles = ['products.json', 'offers.json', 'shops.json', 'complexes.json', 'areas.json', 'scripted.json', 'coverage.json'];
  const missing = fxFiles.filter((f) => !fs.existsSync(path.join(fx, f)));
  add('fixtures', missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : `${fxFiles.length} files`);
  // sqlite
  const dbPath = path.resolve(ROOT, E.SQLITE_PATH);
  if (fs.existsSync(dbPath)) {
    try {
      const db = new Database(dbPath, { readonly: true });
      const c = (t: string) => (db.prepare(`SELECT count(*) c FROM ${t}`).get() as { c: number }).c;
      add('app.sqlite', true, `shops ${c('shops')}, products ${c('products')}, offers ${c('offers')}, ${(fs.statSync(dbPath).size / 1e6).toFixed(1)} MB`);
      const fts = db.prepare(`SELECT count(*) c FROM products_fts WHERE products_fts MATCH '"گوشی"*'`).get() as { c: number };
      add('FTS5 search', fts.c > 0, `${fts.c} hits for «گوشی»`);
    } catch (e) {
      add('app.sqlite', false, String(e));
    }
  } else add('app.sqlite', E.DATA_SOURCE === 'sqlite' ? false : null, 'not built (npm run build:db) — fixtures still work');
  const gz = path.resolve(ROOT, 'data/app.sqlite.gz');
  add('app.sqlite.gz', fs.existsSync(gz) ? fs.statSync(gz).size < 60e6 : null, fs.existsSync(gz) ? `${(fs.statSync(gz).size / 1e6).toFixed(1)} MB` : 'missing');
  // rw dir
  try {
    const rw = path.resolve(ROOT, E.DATA_RW_DIR);
    fs.mkdirSync(rw, { recursive: true });
    fs.writeFileSync(path.join(rw, '.doctor'), String(Date.now()));
    fs.rmSync(path.join(rw, '.doctor'));
    add('DATA_RW_DIR writable', true, E.DATA_RW_DIR);
  } catch (e) {
    add('DATA_RW_DIR writable', false, String(e));
  }

  // BoxAPI
  let recommended: 'auto' | 'scripted' = 'scripted';
  if (!E.KEY) {
    add('BOXAPI_API_KEY', null, 'not set → scripted mode');
  } else {
    add('BOXAPI_API_KEY', true, `set (${E.KEY.length} chars)`);
    const basic = await chat({ messages: [{ role: 'user', content: 'فقط بنویس: سلام' }] }).catch((e) => ({ status: 0, ms: 0, json: null, text: String(e) }));
    const ok = basic.status === 200 && !!msgOf(basic.json).content;
    add(`chat (${E.MODEL})`, ok, ok ? `${basic.ms} ms → «${String(msgOf(basic.json).content).slice(0, 30)}»` : `HTTP ${basic.status} ${basic.text.slice(0, 120)}`);
    if (ok) recommended = 'auto';
    if (ok) {
      const jm = await chat({ messages: [{ role: 'user', content: 'Return {"a":1} as JSON.' }], response_format: { type: 'json_object' } }).catch(() => null);
      add('response_format json_object', jm?.status === 200, jm ? `HTTP ${jm.status}, ${jm.ms} ms` : 'error');
      const tp = await chat({ messages: [{ role: 'user', content: 'hi' }], temperature: 0.3 }).catch(() => null);
      add('temperature passthrough', tp?.status === 200, tp ? `HTTP ${tp.status}${tp.status !== 200 ? ' ' + tp.text.slice(0, 80) : ''}` : 'error');
      const tools = await chat({
        messages: [{ role: 'user', content: 'Search for Samsung phones' }],
        tools: [{ type: 'function', function: { name: 'search', description: 'search products', parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] } } }],
        tool_choice: 'auto',
      }).catch(() => null);
      const called = !!(msgOf(tools?.json ?? null).tool_calls as unknown[] | undefined)?.length;
      add('tool calling', tools?.status === 200 && called, tools ? `HTTP ${tools.status}, tool_calls=${called}` : 'error');
      const lat: number[] = [];
      for (let i = 0; i < 2; i++) {
        const r = await chat({ messages: [{ role: 'user', content: 'یک کلمه بگو' }] }).catch(() => null);
        if (r?.status === 200) lat.push(r.ms);
      }
      add('latency (2 calls)', lat.length === 2, lat.map((x) => `${x} ms`).join(', '));
      if (E.FALLBACK) {
        const fb = await chat({ model: E.FALLBACK, messages: [{ role: 'user', content: 'سلام' }] }).catch(() => null);
        add(`fallback model (${E.FALLBACK})`, fb?.status === 200, fb ? `HTTP ${fb.status}` : 'error');
      }
    }
    // STT
    const audio = makeAudio(path.join(ROOT, 'scripts/fixtures'));
    const candidates = [...new Set([E.STT, 'gpt-4o-mini-transcribe', 'gpt-4o-transcribe', 'whisper-1'].filter(Boolean))];
    let chosen = '';
    const formats: Record<string, boolean> = {};
    for (const m of candidates) {
      let anyOk = false;
      for (const a of audio) {
        const r = await stt(m, a.file, a.mime).catch((e) => ({ ok: false, status: 0, ms: 0, body: String(e).slice(0, 80) }));
        add(`STT ${m} ${path.extname(a.file)}`, r.ok, `HTTP ${r.status}, ${r.ms} ms ${r.ok ? '' : r.body}`);
        if (r.ok) {
          anyOk = true;
          formats[path.extname(a.file)] = true;
        }
      }
      if (anyOk) {
        chosen = m;
        break;
      }
    }
    if (chosen) {
      writeEnvLocal('STT_MODEL', chosen);
      add('STT_MODEL written to .env.local', true, chosen);
      add('webm accepted (no ffmpeg needed)', !!formats['.webm'], formats['.webm'] ? '' : 'server must convert webm → mp3');
    } else {
      writeEnvLocal('STT_MODEL', '');
      add('STT', false, 'no model accepted the sample → STT_MODEL cleared; UI falls back to browser speech / typing');
    }
  }

  // map style
  try {
    const r = await fetch(E.MAP, { signal: AbortSignal.timeout(8000) });
    add('map style reachable', r.ok, `${E.MAP} → HTTP ${r.status}`);
  } catch (e) {
    add('map style reachable', false, `${E.MAP} → ${String(e).slice(0, 60)} (fallback chain will kick in)`);
  }

  console.log('\n┌──────────────────────────────────────┬────┐');
  for (const r of rows) console.log(`│ ${r.check.padEnd(36).slice(0, 36)} │ ${r.ok === null ? ' · ' : r.ok ? ' ✓ ' : ' ✗ '}│`);
  console.log('└──────────────────────────────────────┴────┘');
  console.log(`Recommended LLM_MODE=${recommended}`);
  fs.writeFileSync(
    path.join(ROOT, 'scripts/fixtures/doctor-last.json'),
    JSON.stringify({ at: new Date().toISOString(), recommended, rows }, null, 2),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
