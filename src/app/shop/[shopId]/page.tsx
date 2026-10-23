import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ShopInbox } from '@/components/ShopInbox';

export const metadata: Metadata = { title: 'ترب‌یار — صندوق استعلام فروشنده' };
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  return (
    <Suspense>
      <ShopInbox shopId={decodeURIComponent(shopId)} />
    </Suspense>
  );
}
