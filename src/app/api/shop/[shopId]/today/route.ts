import { z } from 'zod';
import { setToday } from '@/lib/inquiries/service';
import { checkToken } from '@/lib/inquiries/token';
import { bad, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

const HHMM = z.string().regex(/^\d{2}:\d{2}$/);
const Body = z.object({
  closedToday: z.boolean().optional(),
  hours: z.array(z.object({ start: HHMM, end: HHMM })).max(3).nullish(),
});

export async function POST(req: Request, ctx: RouteContext<'/api/shop/[shopId]/today'>) {
  const { shopId } = await ctx.params;
  if (!checkToken(shopId, new URL(req.url).searchParams.get('t'))) return bad('دسترسی ندارید', 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad('درخواست نامعتبر');
  return json({ override: setToday(shopId, { closedToday: parsed.data.closedToday, hours: parsed.data.hours ?? undefined }) });
}
