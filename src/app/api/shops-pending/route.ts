import { env } from '@/lib/env';
import { store } from '@/lib/inquiries/db';
import { getInquiries } from '@/lib/inquiries/service';
import { shopToken } from '@/lib/inquiries/token';
import { getSource } from '@/lib/data/source';
import { bad, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** Demo index: shops with pending inquiries + tokenised inbox links (only when DEMO_INDEX=1). */
export async function GET() {
  if (!env.demoIndex) return bad('غیرفعال', 404);
  const src = getSource();
  // resolve due auto-replies first so the index only lists inquiries that really wait for a human
  await getInquiries(store().pendingIds(), 200);
  const rows = store().pendingShops();
  const shops = await Promise.all(
    rows.map(async (r) => {
      const s = await src.getShop(r.shopId);
      return { shopId: r.shopId, name: s?.name ?? r.shopId, address: s?.address ?? '', pending: r.n, token: shopToken(r.shopId) };
    }),
  );
  return json({ shops, autoReply: env.autoReply, skipQuestions: env.autoReplySkipQuestions });
}
