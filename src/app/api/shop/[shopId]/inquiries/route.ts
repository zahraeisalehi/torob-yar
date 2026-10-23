import { shopInbox } from '@/lib/inquiries/service';
import { checkToken } from '@/lib/inquiries/token';
import { bad, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: RouteContext<'/api/shop/[shopId]/inquiries'>) {
  const { shopId } = await ctx.params;
  if (!checkToken(shopId, new URL(req.url).searchParams.get('t'))) return bad('دسترسی ندارید', 403);
  return json(await shopInbox(shopId));
}
