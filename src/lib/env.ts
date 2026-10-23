import 'server-only';
import { z } from 'zod';

const schema = z.object({
  DATA_SOURCE: z.enum(['fixtures', 'sqlite']).default('fixtures'),
  SQLITE_PATH: z.string().default('./data/app.sqlite'),
  DATA_RW_DIR: z.string().default('./data/rw'),
  LLM_MODE: z.enum(['auto', 'live', 'scripted']).default('auto'),
  BOXAPI_BASE_URL: z.string().default('https://ai.boxapi.ir/ai/v1'),
  BOXAPI_API_KEY: z.string().default(''),
  LLM_MODEL: z.string().default('gpt-5.4-mini'),
  LLM_FALLBACK_MODEL: z.string().default(''),
  LLM_REASONING_EFFORT: z.string().default('none'),
  STT_MODEL: z.string().default('gpt-4o-mini-transcribe'),
  GEO_PROVIDER: z.enum(['placeholder', 'neshan']).default('placeholder'),
  AUTO_REPLY: z.string().default('1'),
  AUTO_REPLY_MIN_S: z.coerce.number().default(4),
  AUTO_REPLY_MAX_S: z.coerce.number().default(15),
  INQUIRY_TIMEOUT_S: z.coerce.number().default(60),
  SHOP_TOKEN_SECRET: z.string().default('dev-secret-change-me'),
  DEMO_INDEX: z.string().default('1'),
  APP_VERSION: z.string().default('dev'),
});

const parsed = schema.safeParse(
  Object.fromEntries(Object.entries(process.env).map(([k, v]) => [k, v === '' && !['BOXAPI_API_KEY', 'STT_MODEL', 'LLM_FALLBACK_MODEL', 'LLM_REASONING_EFFORT'].includes(k) ? undefined : v])),
);
if (!parsed.success) console.error(JSON.stringify({ msg: 'env invalid, using defaults', issues: parsed.error.issues }));
const e = parsed.success ? parsed.data : schema.parse({});

export const env = {
  ...e,
  autoReply: e.AUTO_REPLY === '1' || e.AUTO_REPLY === 'true',
  demoIndex: e.DEMO_INDEX === '1' || e.DEMO_INDEX === 'true',
  /** effective LLM mode: auto → live only when a key exists */
  llmLive: e.LLM_MODE === 'live' || (e.LLM_MODE === 'auto' && !!e.BOXAPI_API_KEY),
};
