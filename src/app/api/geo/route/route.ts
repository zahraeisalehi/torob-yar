import { getGeo } from '@/lib/geo';
import { bad, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const n = (k: string) => Number(sp.get(k));
  const from = { lat: n('fromLat'), lon: n('fromLon') };
  const to = { lat: n('toLat'), lon: n('toLon') };
  if (![from.lat, from.lon, to.lat, to.lon].every(Number.isFinite)) return bad('مختصات نامعتبر');
  return json({ coordinates: await getGeo().route(from, to), approximate: true });
}
