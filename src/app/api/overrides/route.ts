import { overridesFor } from '@/lib/inquiries/service';
import { json } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** Today's hours overrides set by shop owners (closed today / custom hours) for a list of shops. */
export async function GET(req: Request) {
  const ids = (new URL(req.url).searchParams.get('ids') ?? '').split(',').filter(Boolean);
  return json({ overrides: overridesFor(ids) });
}
