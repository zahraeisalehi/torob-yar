import { z } from 'zod';
import { createInquiry, getInquiries } from '@/lib/inquiries/service';
import { bad, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

const Body = z.object({
  shopId: z.string().min(1).max(64),
  productId: z.string().min(1).max(64),
  question: z.string().max(300).nullish(),
  autoReply: z.boolean().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad('درخواست نامعتبر');
  return json({ inquiry: await createInquiry(parsed.data) });
}

export async function GET(req: Request) {
  const ids = (new URL(req.url).searchParams.get('ids') ?? '').split(',').filter(Boolean);
  return json({ inquiries: await getInquiries(ids) });
}
