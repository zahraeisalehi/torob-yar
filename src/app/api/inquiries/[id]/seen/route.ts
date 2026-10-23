import { markSeen } from '@/lib/inquiries/service';
import { store } from '@/lib/inquiries/db';
import { checkToken } from '@/lib/inquiries/token';
import { bad, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: RouteContext<'/api/inquiries/[id]/seen'>) {
  const { id } = await ctx.params;
  const inq = store().get(id);
  if (!inq) return bad('پیدا نشد', 404);
  if (!checkToken(inq.shopId, new URL(req.url).searchParams.get('t'))) return bad('دسترسی ندارید', 403);
  return json({ inquiry: markSeen(id) });
}
