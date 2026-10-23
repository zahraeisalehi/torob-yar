import type { Metadata } from 'next';
import { ShopIndex } from '@/components/ShopInbox';

export const metadata: Metadata = { title: 'ترب‌یار — پنل فروشنده (دمو)' };
export const dynamic = 'force-dynamic';

export default function Page() {
  return <ShopIndex />;
}
