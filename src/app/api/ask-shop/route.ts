import { z } from 'zod';
import { answerFromData } from '@/lib/inquiries/service';
import { getSource } from '@/lib/data/source';
import { llmJson } from '@/lib/agent/llm';
import { ANSWER_FROM_DATA_SYSTEM } from '@/lib/agent/prompts';
import { bad, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

const Body = z.object({ shopId: z.string().min(1), productId: z.string().min(1), question: z.string().min(1).max(300) });
const Answer = z.object({ answerable: z.boolean(), answer: z.string().nullish() });

/** §4.1: try to answer from the seller's listed data first; null means "ask the shop". */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad('درخواست نامعتبر');
  const { shopId, productId, question } = parsed.data;
  const rule = await answerFromData(shopId, productId, question);
  if (rule) return json({ answer: rule, source: 'data' });
  const offer = (await getSource().getOffers(productId)).find((o) => o.shopId === shopId);
  if (offer && (offer.description || offer.warranty)) {
    const r = await llmJson(
      'answer_from_data',
      Answer,
      ANSWER_FROM_DATA_SYSTEM,
      `عنوان فروشنده: ${offer.sellerTitle}\nتوضیحات: ${offer.description ?? 'ندارد'}\nگارانتی: ${offer.warranty ?? 'ثبت نشده'}\n\nسؤال: ${question}`,
      12_000,
    );
    if (r?.answerable && r.answer) return json({ answer: r.answer, source: 'data' });
  }
  return json({ answer: null, source: null });
}
