import { ChatRequestSchema } from '@/lib/agent/blocks';
import { runChat } from '@/lib/agent/pipeline';
import { bad, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) return bad('درخواست نامعتبر');
  try {
    return json(await runChat(parsed.data));
  } catch (e) {
    console.error(JSON.stringify({ kind: 'chat_error', error: String(e) }));
    return bad('خطا در پاسخ‌گویی', 500);
  }
}
