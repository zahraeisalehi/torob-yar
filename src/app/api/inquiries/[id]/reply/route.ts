import { z } from 'zod';
import { reply } from '@/lib/inquiries/service';
import { store } from '@/lib/inquiries/db';
import { checkToken } from '@/lib/inquiries/token';
import { bad, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

const Body = z.object({
  outcome: z.enum(['confirm', 'new_price', 'out_of_stock']),
  newPrice: z.number().positive().nullish(),
  answer: z.string().max(300).nullish(),
});

export async function POST(req: Request, ctx: RouteContext<'/api/inquiries/[id]/reply'>) {
  const { id } = await ctx.params;
  const inq = store().get(id);
  if (!inq) return bad('پیدا نشد', 404);
  if (!checkToken(inq.shopId, new URL(req.url).searchParams.get('t'))) return bad('دسترسی ندارید', 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad('درخواست نامعتبر');
  if (parsed.data.outcome === 'new_price' && !parsed.data.newPrice) return bad('قیمت جدید را وارد کنید');
  return json({ inquiry: reply(id, parsed.data) });
}
