import { transcribe } from '@/lib/agent/stt';
import { env } from '@/lib/env';
import { bad, json } from '@/lib/http';

export const dynamic = 'force-dynamic';
export const maxDuration = 40;

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  if (!env.BOXAPI_API_KEY || env.LLM_MODE === 'scripted') return bad('تبدیل گفتار به متن فعال نیست', 503);
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof Blob)) return bad('فایل صوتی ارسال نشده');
  if (file.size > MAX_BYTES) return bad('صدای ضبط‌شده خیلی طولانی است', 413);
  const mime = String(form?.get('mime') || file.type || 'audio/webm');
  try {
    return json({ text: await transcribe(file, mime) });
  } catch (e) {
    console.error(JSON.stringify({ kind: 'stt_error', error: String(e).slice(0, 300) }));
    return bad('تبدیل صدا به متن انجام نشد', 502);
  }
}
