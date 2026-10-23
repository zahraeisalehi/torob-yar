import 'server-only';
import fs from 'node:fs';
import { env } from '../env';
import type { DataSource } from './types';
import { createFixtureSource } from './fixtures';

let source: DataSource | null = null;
let fallbackReason: string | null = null;

/** DATA_SOURCE=sqlite falls back to fixtures (logged) if the DB is missing or fails to open. */
export function getSource(): DataSource {
  if (source) return source;
  if (env.DATA_SOURCE === 'sqlite') {
    try {
      if (!fs.existsSync(env.SQLITE_PATH)) throw new Error(`missing ${env.SQLITE_PATH}`);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createSqliteSource } = require('./sqlite') as typeof import('./sqlite');
      source = createSqliteSource(env.SQLITE_PATH);
      return source;
    } catch (e) {
      fallbackReason = String(e);
      console.error(JSON.stringify({ msg: 'sqlite unavailable, using fixtures', error: fallbackReason }));
    }
  }
  source = createFixtureSource();
  return source;
}

export function sourceFallbackReason() {
  return fallbackReason;
}
