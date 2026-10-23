import { z } from 'zod';
import { getSource } from '@/lib/data/source';
import { getGeo } from '@/lib/geo';
import { llmText } from '@/lib/agent/llm';
import { FIND_HELP_SYSTEM } from '@/lib/agent/prompts';
import { floorLabel, toFaDigits } from '@/lib/domain/format';
import { bad, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

const Body = z.object({ shopId: z.string().min(1), question: z.string().min(1).max(300) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad('درخواست نامعتبر');
  const shop = await getSource().getShop(parsed.data.shopId);
  if (!shop) return bad('فروشگاه پیدا نشد', 404);
  const landmarks = await getGeo().reverse(shop.lat, shop.lon, shop.locationLabel);
  const floor = floorLabel(shop.floor);
  const facts = [
    `آدرس کامل: ${shop.address}`,
    shop.complex ? `پاساژ: ${shop.complex.name}` : 'پاساژ: ثبت نشده',
    `طبقه: ${floor ?? 'ثبت نشده'}`,
    `واحد/پلاک: ${shop.unit ?? 'ثبت نشده'}`,
    `محله: ${shop.locationLabel}`,
    `نشانه‌های نزدیک (تقریبی): ${landmarks.join('، ')}`,
  ].join('\n');
  const q = parsed.data.question;
  const live = await llmText('find_help', FIND_HELP_SYSTEM, `${facts}\n\nسؤال کاربر: ${q}`);
  if (live) return json({ answer: live, source: 'live', landmarks });

  // Template answer from parsed fields.
  const parts: string[] = [];
  if (/طبقه/.test(q)) parts.push(floor ? `مغازه در ${floor}${shop.complex ? ` ${shop.complex.name}` : ''} است.` : 'طبقه در آدرس ثبت نشده؛ از نگهبان یا تابلوی راهنمای پاساژ بپرسید.');
  if (/ورودی/.test(q))
    parts.push(
      shop.complex
        ? `ورودی دقیق ثبت نشده؛ حدس من این است که ورودی اصلی ${shop.complex.name} سمت ${landmarks[0]} باشد.`
        : `ورودی ثبت نشده؛ احتمالاً از سمت ${landmarks[0]} نزدیک‌تر است.`,
    );
  if (/نزدیک|کجا/.test(q) || !parts.length) parts.push(`نزدیک ${landmarks.join(' و ')} است (تقریبی).`);
  if (shop.unit) parts.push(`دنبال واحد ${toFaDigits(shop.unit)} بگردید.`);
  return json({ answer: parts.join(' '), source: 'template', landmarks });
}
