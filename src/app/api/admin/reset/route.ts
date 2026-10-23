import { store } from '@/lib/inquiries/db';
import { env } from '@/lib/env';
import { bad, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (new URL(req.url).searchParams.get('key') !== env.SHOP_TOKEN_SECRET) return bad('دسترسی ندارید', 403);
  store().reset();
  return json({ ok: true });
}
