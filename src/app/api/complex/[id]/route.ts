import { getSource } from '@/lib/data/source';
import { bad, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, ctx: RouteContext<'/api/complex/[id]'>) {
  const { id } = await ctx.params;
  const productId = new URL(req.url).searchParams.get('productId') ?? undefined;
  const res = await getSource().getComplex(id, productId);
  if (!res) return bad('پاساژ پیدا نشد', 404);
  return json(res);
}
