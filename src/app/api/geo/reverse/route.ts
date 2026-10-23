import { getGeo } from '@/lib/geo';
import { bad, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const lat = Number(sp.get('lat'));
  const lon = Number(sp.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return bad('مختصات نامعتبر');
  return json({ landmarks: await getGeo().reverse(lat, lon, sp.get('label') ?? undefined), approximate: true });
}
