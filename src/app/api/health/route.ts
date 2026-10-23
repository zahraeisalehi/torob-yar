import fs from 'node:fs';
import { getSource, sourceFallbackReason } from '@/lib/data/source';
import { env } from '@/lib/env';
import { sttStatus } from '@/lib/agent/stt';
import { store } from '@/lib/inquiries/db';
import { json } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  const src = getSource();
  let counts = { shops: 0, products: 0, offers: 0 };
  let ok = true;
  try {
    counts = await src.counts();
  } catch {
    ok = false;
  }
  let rwWritable = false;
  try {
    fs.mkdirSync(env.DATA_RW_DIR, { recursive: true });
    fs.accessSync(env.DATA_RW_DIR, fs.constants.W_OK);
    rwWritable = true;
  } catch {
    /* not writable */
  }
  return json({
    ok: ok && counts.products > 0,
    dataSource: src.kind,
    dataSourceRequested: env.DATA_SOURCE,
    dataSourceFallback: sourceFallbackReason(),
    llmMode: env.llmLive ? 'live' : 'scripted',
    llmModeSetting: env.LLM_MODE,
    stt: sttStatus(),
    geoProvider: env.GEO_PROVIDER === 'neshan' ? 'placeholder' : env.GEO_PROVIDER,
    autoReply: env.autoReply,
    inquiryStore: store().kind,
    rwWritable,
    demoIndex: env.demoIndex,
    counts,
    version: env.APP_VERSION,
  });
}
