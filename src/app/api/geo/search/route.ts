import { getGeo } from '@/lib/geo';
import { json } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  return json({ places: await getGeo().search(q), provider: getGeo().name, approximate: true });
}
