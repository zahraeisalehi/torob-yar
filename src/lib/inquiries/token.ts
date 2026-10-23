import 'server-only';
import crypto from 'node:crypto';
import { env } from '../env';

export function shopToken(shopId: string): string {
  return crypto.createHmac('sha256', env.SHOP_TOKEN_SECRET).update(shopId).digest('hex').slice(0, 16);
}

export function checkToken(shopId: string, token: string | null): boolean {
  if (!token) return false;
  const a = Buffer.from(shopToken(shopId));
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
