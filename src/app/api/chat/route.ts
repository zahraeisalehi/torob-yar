import { ChatRequestSchema } from '@/lib/agent/blocks';
import { runChat } from '@/lib/agent/pipeline';
import { bad, json } from '@/lib/http';
import { env } from '@/lib/env';
import { withTrace } from '@/lib/trace';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) return bad('درخواست نامعتبر');
  try {
    // per-stage debug trace, only for whoever holds the shop-token secret (npm run trace -- --url …)
    if (req.headers.get('x-debug-trace') === env.SHOP_TOKEN_SECRET) {
      const { result, trace } = await withTrace(() => runChat(parsed.data));
      return json({ ...result, trace });
    }
    return json(await runChat(parsed.data));
  } catch (e) {
    console.error(JSON.stringify({ kind: 'chat_error', error: String(e) }));
    return bad('خطا در پاسخ‌گویی', 500);
  }
}
