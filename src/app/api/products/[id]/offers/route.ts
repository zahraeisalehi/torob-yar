import { getSource } from '@/lib/data/source';
import { bad, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: RouteContext<'/api/products/[id]/offers'>) {
  const { id } = await ctx.params;
  const src = getSource();
  const product = await src.getProduct(id);
  if (!product) return bad('کالا پیدا نشد', 404);
  const offers = await src.getOffers(id);
  return json({ product, offers });
}
